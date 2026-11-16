import { ConvexError, type Infer } from "convex/values";
import type { budgetStage } from "../../schema/budgetBoard";
import { graphJson, sharepointError } from "./graph";
import { SHAREPOINT_LIBRARIES } from "./libraries";

/**
 * A pasta TRELLO de orçamentos (site Projetos, "z/Orçamentos/TRELLO") vista
 * pelo quadro de orçamentos: uma subpasta por etapa e, dentro dela, uma pasta
 * por orçamento. O quadro do dashboard é a fonte da verdade; daqui saem só a
 * conferência (onde está cada pasta) e o "mover pasta" para a etapa do card.
 *
 * - Para Fazer guarda os orçamentos em subpastas de ano ("2026"); as
 *   subpastas "Ultrapassados..." contam como obsoletas.
 * - Em Andamento, Concluído e Obsoletos guardam as pastas direto.
 * - Pasta Padrão (o modelo) e arquivos soltos ficam de fora.
 */
export const TRELLO_PATH = ["z", "Orçamentos", "TRELLO"] as const;

export type BudgetStage = Infer<typeof budgetStage>;

/** Pasta de cada etapa, pelo começo do nome (Obsoletos tem um parêntese explicativo). */
const STAGE_FOLDERS: { stage: BudgetStage; prefix: string; grouped: boolean }[] = [
  { stage: "para_fazer", prefix: "Para Fazer", grouped: true },
  { stage: "em_andamento", prefix: "Em Andamento", grouped: false },
  { stage: "concluido", prefix: "Concluído", grouped: false },
  { stage: "obsoleto", prefix: "Obsoletos", grouped: false },
];
/** Subpastas de Para Fazer com esse começo guardam orçamentos que passaram do prazo. */
const STALE_GROUP_PREFIX = "Ultrapassad";
const FIELDS = "id,name,webUrl,lastModifiedDateTime,folder,parentReference";

interface GraphItem {
  id: string;
  name: string;
  webUrl?: string;
  lastModifiedDateTime?: string;
  folder?: { childCount?: number };
  parentReference?: { id?: string; path?: string };
}

interface GraphPage {
  value: GraphItem[];
  /** URL absoluta do Graph para a próxima página. */
  "@odata.nextLink"?: string;
}

/** Uma pasta de orçamento encontrada numa etapa. */
export interface TrelloFolder {
  itemId: string;
  name: string;
  webUrl: string | null;
  modifiedAt: number | null;
  stage: BudgetStage;
  /** Subpasta de Para Fazer onde a pasta está ("2026", "Ultrapassados"); null nas demais. */
  group: string | null;
}

export interface TrelloStageFolder {
  stage: BudgetStage;
  itemId: string;
  name: string;
  webUrl: string | null;
  /** Pastas de orçamento nessa etapa. */
  folderCount: number;
}

export interface TrelloScan {
  webUrl: string | null;
  stages: TrelloStageFolder[];
  folders: TrelloFolder[];
}

const fold = (name: string) => name.normalize("NFC").toLocaleLowerCase("pt-BR");
const startsWith = (name: string, prefix: string) => fold(name).startsWith(fold(prefix));

function siteDrive(): string {
  return `/sites/${SHAREPOINT_LIBRARIES.projetos.siteId}/drive`;
}

function address(segments: readonly string[]): string {
  const path = segments.map((segment) => encodeURIComponent(segment.normalize("NFC"))).join("/");
  return `${siteDrive()}/root:/${path}:`;
}

function toFolder(item: GraphItem, stage: BudgetStage, group: string | null): TrelloFolder {
  const modified = item.lastModifiedDateTime ? Date.parse(item.lastModifiedDateTime) : NaN;
  return {
    itemId: item.id,
    name: item.name.normalize("NFC"),
    webUrl: item.webUrl ?? null,
    modifiedAt: Number.isFinite(modified) ? modified : null,
    stage,
    group: group?.normalize("NFC") ?? null,
  };
}

/** Subpastas (seguindo as páginas do Graph), por nome. */
async function subfoldersOf(first: string, label: string): Promise<GraphItem[]> {
  const items: GraphItem[] = [];
  let next: string | undefined = first;
  while (next) {
    const page: GraphPage = await graphJson<GraphPage>({
      path: next,
      notFoundMessage: `Pasta não encontrada no SharePoint: ${label}`,
    });
    items.push(...page.value);
    next = page["@odata.nextLink"];
  }
  return items
    .filter((item) => item.folder)
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

function childrenByPath(segments: readonly string[]): Promise<GraphItem[]> {
  return subfoldersOf(
    `${address(segments)}/children?$top=200&$select=${FIELDS}`,
    segments.join("/")
  );
}

function childrenById(item: GraphItem): Promise<GraphItem[]> {
  return subfoldersOf(
    `${siteDrive()}/items/${encodeURIComponent(item.id)}/children?$top=200&$select=${FIELDS}`,
    item.name
  );
}

/** As pastas de etapa da TRELLO, na ordem do quadro (as que existirem). */
async function stageFolders(): Promise<{ root: GraphItem; stages: (GraphItem & { stage: BudgetStage; grouped: boolean })[] }> {
  const [root, top] = await Promise.all([
    graphJson<GraphItem>({
      path: `${address(TRELLO_PATH)}?$select=${FIELDS}`,
      notFoundMessage: `Pasta não encontrada no SharePoint: ${TRELLO_PATH.join("/")}`,
    }),
    childrenByPath(TRELLO_PATH),
  ]);
  const stages = STAGE_FOLDERS.flatMap(({ stage, prefix, grouped }) => {
    const item = top.find((candidate) => startsWith(candidate.name, prefix));
    return item ? [{ ...item, stage, grouped }] : [];
  });
  return { root, stages };
}

/**
 * Todas as pastas de orçamento da TRELLO, com a etapa onde estão. Hoje são
 * umas 10 chamadas ao Graph (raiz, etapas e grupos de Para Fazer).
 */
export async function scanTrello(): Promise<TrelloScan> {
  const { root, stages } = await stageFolders();
  const perStage = await Promise.all(
    stages.map(async (stageFolder) => {
      const direct = await childrenById(stageFolder);
      if (!stageFolder.grouped) {
        return direct.map((item) => toFolder(item, stageFolder.stage, null));
      }
      const groups = await Promise.all(
        direct.map(async (group) => {
          const stage: BudgetStage = startsWith(group.name, STALE_GROUP_PREFIX)
            ? "obsoleto"
            : stageFolder.stage;
          return (await childrenById(group)).map((item) => toFolder(item, stage, group.name));
        })
      );
      return groups.flat();
    })
  );
  const folders = perStage.flat();
  return {
    webUrl: root.webUrl ?? null,
    stages: stages.map((stageFolder) => ({
      stage: stageFolder.stage,
      itemId: stageFolder.id,
      name: stageFolder.name.normalize("NFC"),
      webUrl: stageFolder.webUrl ?? null,
      folderCount: folders.filter(
        (folder) => folder.stage === stageFolder.stage && !isStaleGroup(folder.group)
      ).length,
    })),
    folders,
  };
}

function isStaleGroup(group: string | null): boolean {
  return group !== null && startsWith(group, STALE_GROUP_PREFIX);
}

/**
 * Se a pasta está dentro da TRELLO, pelo caminho do pai no Graph
 * ("/drives/{id}/root:/z/Orçamentos/TRELLO/Em Andamento", às vezes codificado).
 */
export function isInsideTrello(parentPath: string | undefined): boolean {
  if (!parentPath) return false;
  let decoded = parentPath;
  try {
    decoded = decodeURIComponent(parentPath);
  } catch {
    // caminho já sem codificação
  }
  const afterRoot = /\/root:(\/.*)?$/.exec(decoded.normalize("NFC"))?.[1] ?? "";
  const trello = fold(`/${TRELLO_PATH.join("/")}`);
  const path = fold(afterRoot);
  return path === trello || path.startsWith(`${trello}/`);
}

/** Pasta de destino de uma etapa; em Para Fazer, a subpasta do ano (criada se faltar). */
async function targetFolder(stage: BudgetStage, year: number): Promise<GraphItem> {
  const { stages } = await stageFolders();
  const stageFolder = stages.find((candidate) => candidate.stage === stage);
  if (!stageFolder) {
    throw sharepointError("NOT_FOUND", `A TRELLO não tem a pasta da etapa (${stage}).`);
  }
  if (!stageFolder.grouped) return stageFolder;
  const yearName = String(year);
  const existing = (await childrenById(stageFolder)).find((group) => group.name === yearName);
  if (existing) return existing;
  return await graphJson<GraphItem>({
    method: "POST",
    path: `${siteDrive()}/items/${encodeURIComponent(stageFolder.id)}/children`,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: yearName, folder: {}, "@microsoft.graph.conflictBehavior": "fail" }),
    conflictMessage: `Já existe "${yearName}" em ${stageFolder.name}; confira de novo.`,
  });
}

/**
 * Move a pasta de um orçamento para a pasta da etapa. Só move pastas que
 * estão dentro da TRELLO (o id vem da conferência, mas é conferido de novo).
 * Devolve a pasta no lugar novo.
 */
export async function moveTrelloFolder(args: {
  itemId: string;
  stage: BudgetStage;
  year: number;
}): Promise<TrelloFolder> {
  const item = await graphJson<GraphItem>({
    path: `${siteDrive()}/items/${encodeURIComponent(args.itemId)}?$select=${FIELDS}`,
    notFoundMessage: "A pasta deste card não existe mais no SharePoint; confira as pastas de novo.",
  });
  if (!item.folder || !isInsideTrello(item.parentReference?.path)) {
    throw new ConvexError({
      code: "FOLDER_NOT_ALLOWED",
      message: "Só é possível mover pastas de orçamento que estão na TRELLO.",
    });
  }
  const target = await targetFolder(args.stage, args.year);
  const group = args.stage === "para_fazer" ? target.name : null;
  if (item.parentReference?.id === target.id) return toFolder(item, args.stage, group);
  const moved = await graphJson<GraphItem>({
    method: "PATCH",
    path: `${siteDrive()}/items/${encodeURIComponent(item.id)}?@microsoft.graph.conflictBehavior=fail`,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ parentReference: { id: target.id } }),
    notFoundMessage: "A pasta deste card não existe mais no SharePoint; confira as pastas de novo.",
    conflictMessage: `Já existe uma pasta "${item.name}" em ${target.name}.`,
  });
  return toFolder(moved, args.stage, group);
}

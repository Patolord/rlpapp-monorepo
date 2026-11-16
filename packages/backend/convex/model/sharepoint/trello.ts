import { v, type Infer } from "convex/values";
import { graphJson } from "./graph";
import { SHAREPOINT_LIBRARIES } from "./libraries";

/**
 * Quadro (kanban) da pasta TRELLO de orçamentos (site Projetos,
 * "z/Orçamentos/TRELLO"). Cada subpasta é uma etapa e cada pasta dentro dela é
 * um orçamento:
 *
 * - Para Fazer: agrupado por subpasta (2026, Ultrapassados...), um card por
 *   pasta dentro de cada grupo;
 * - Em Andamento: um card por pasta;
 * - as demais etapas (Concluído, Obsoletos) vêm só com a contagem;
 * - Pasta Padrão (o modelo) fica de fora.
 */
export const TRELLO_PATH = ["z", "Orçamentos", "TRELLO"] as const;

/** Etapas do quadro, na ordem das colunas; `grouped`: subpastas viram grupos. */
const BOARD_STAGES = [
  { name: "Para Fazer", grouped: true },
  { name: "Em Andamento", grouped: false },
] as const;
/** Etapas que não aparecem nem na contagem. */
const HIDDEN_STAGES = ["Pasta Padrão"];
/** Ordem das etapas só com contagem; as não listadas vêm depois, por nome. */
const OTHER_STAGE_ORDER = ["Concluído", "Obsoletos"];
/** Grupos com esse começo de nome são antigos: vêm por último (e recolhidos na tela). */
const STALE_GROUP_PREFIX = "ultrapassad";
const FIELDS = "name,webUrl,lastModifiedDateTime,folder,file";

interface GraphItem {
  name: string;
  webUrl?: string;
  lastModifiedDateTime?: string;
  folder?: { childCount?: number };
  file?: object;
}

interface GraphPage {
  value: GraphItem[];
  /** URL absoluta do Graph para a próxima página. */
  "@odata.nextLink"?: string;
}

const trelloCardValidator = v.object({
  name: v.string(),
  modifiedAt: v.union(v.number(), v.null()),
  webUrl: v.union(v.string(), v.null()),
});

export const trelloBoardValidator = v.object({
  webUrl: v.union(v.string(), v.null()),
  /** Colunas do quadro: Para Fazer e Em Andamento. */
  columns: v.array(
    v.object({
      name: v.string(),
      webUrl: v.union(v.string(), v.null()),
      /** Cards na coluna (somando os grupos). */
      count: v.number(),
      groups: v.array(
        v.object({
          /** Subpasta do grupo; null para os cards direto na etapa. */
          name: v.union(v.string(), v.null()),
          webUrl: v.union(v.string(), v.null()),
          /** Grupo antigo ("Ultrapassados..."). */
          stale: v.boolean(),
          cards: v.array(trelloCardValidator),
        })
      ),
    })
  ),
  /** Demais etapas, só com a contagem de itens. */
  others: v.array(
    v.object({ name: v.string(), count: v.number(), webUrl: v.union(v.string(), v.null()) })
  ),
});

export type TrelloBoard = Infer<typeof trelloBoardValidator>;

const fold = (name: string) => name.normalize("NFC").toLocaleLowerCase("pt-BR");
const startsWith = (name: string, prefix: string) => fold(name).startsWith(fold(prefix));
const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "pt-BR");

function modifiedAt(item: GraphItem): number | null {
  const modified = item.lastModifiedDateTime ? Date.parse(item.lastModifiedDateTime) : NaN;
  return Number.isFinite(modified) ? modified : null;
}

function toCard(item: GraphItem): Infer<typeof trelloCardValidator> {
  return { name: item.name.normalize("NFC"), modifiedAt: modifiedAt(item), webUrl: item.webUrl ?? null };
}

function address(segments: readonly string[]): string {
  const path = segments.map((segment) => encodeURIComponent(segment.normalize("NFC"))).join("/");
  return `/sites/${SHAREPOINT_LIBRARIES.projetos.siteId}/drive/root:/${path}:`;
}

/** Subpastas da pasta (seguindo as páginas do Graph), ordenadas por nome. */
async function subfolders(segments: readonly string[]): Promise<GraphItem[]> {
  const items: GraphItem[] = [];
  let next: string | undefined = `${address(segments)}/children?$top=200&$select=${FIELDS}`;
  while (next) {
    const page: GraphPage = await graphJson<GraphPage>({
      path: next,
      notFoundMessage: `Pasta não encontrada no SharePoint: ${segments.join("/")}`,
    });
    items.push(...page.value);
    next = page["@odata.nextLink"];
  }
  return items.filter((item) => item.folder).sort(byName);
}

async function boardColumn(stage: GraphItem, grouped: boolean) {
  const path = [...TRELLO_PATH, stage.name];
  const direct = await subfolders(path);
  const groups = grouped
    ? await Promise.all(
        direct.map(async (group) => ({
          name: group.name.normalize("NFC"),
          webUrl: group.webUrl ?? null,
          stale: startsWith(group.name, STALE_GROUP_PREFIX),
          cards: (await subfolders([...path, group.name])).map(toCard),
        }))
      )
    : [{ name: null, webUrl: null, stale: false, cards: direct.map(toCard) }];
  groups.sort((a, b) => Number(a.stale) - Number(b.stale) || (a.name ?? "").localeCompare(b.name ?? "", "pt-BR"));
  return {
    name: stage.name.normalize("NFC"),
    webUrl: stage.webUrl ?? null,
    count: groups.reduce((total, group) => total + group.cards.length, 0),
    groups,
  };
}

function otherRank(name: string): number {
  const index = OTHER_STAGE_ORDER.findIndex((stage) => startsWith(name, stage));
  return index === -1 ? OTHER_STAGE_ORDER.length : index;
}

export async function getTrelloBoard(): Promise<TrelloBoard> {
  const [root, stages] = await Promise.all([
    graphJson<GraphItem>({
      path: `${address(TRELLO_PATH)}?$select=${FIELDS}`,
      notFoundMessage: `Pasta não encontrada no SharePoint: ${TRELLO_PATH.join("/")}`,
    }),
    subfolders(TRELLO_PATH),
  ]);

  const columns = await Promise.all(
    BOARD_STAGES.flatMap(({ name, grouped }) => {
      const stage = stages.find((item) => startsWith(item.name, name));
      return stage ? [boardColumn(stage, grouped)] : [];
    })
  );

  const others = stages
    .filter(
      (stage) =>
        !BOARD_STAGES.some(({ name }) => startsWith(stage.name, name)) &&
        !HIDDEN_STAGES.some((name) => startsWith(stage.name, name))
    )
    .map((stage) => ({
      name: stage.name.normalize("NFC"),
      count: stage.folder?.childCount ?? 0,
      webUrl: stage.webUrl ?? null,
    }))
    .sort((a, b) => otherRank(a.name) - otherRank(b.name) || byName(a, b));

  return { webUrl: root.webUrl ?? null, columns, others };
}

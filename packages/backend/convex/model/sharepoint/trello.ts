import { v, type Infer } from "convex/values";
import { graphJson } from "./graph";
import { SHAREPOINT_LIBRARIES } from "./libraries";

/**
 * Painel da pasta TRELLO de orçamentos (site Projetos, "z/Orçamentos/TRELLO"):
 * cada subpasta é uma etapa (Para Fazer, Em Andamento, Concluído...) e cada
 * item dentro dela é um orçamento. Só lê esse caminho fixo, fora das pastas
 * liberadas de libraries.ts, por isso não aceita caminho do cliente.
 */
export const TRELLO_PATH = ["z", "Orçamentos", "TRELLO"] as const;

/** Etapas na ordem do quadro; pastas com outro nome vêm depois, por nome. */
const STAGE_ORDER = ["Para Fazer", "Em Andamento", "Concluído", "Obsoletos"];
/** Pastas com até esse número de itens vêm com a lista de nomes. */
const MAX_LISTED_ITEMS = 50;
const FIELDS = "name,webUrl,lastModifiedDateTime,folder,file";

interface GraphItem {
  name: string;
  webUrl?: string;
  lastModifiedDateTime?: string;
  folder?: { childCount?: number };
  file?: object;
}

const trelloEntryValidator = v.object({
  name: v.string(),
  kind: v.union(v.literal("folder"), v.literal("file")),
  modifiedAt: v.union(v.number(), v.null()),
  webUrl: v.union(v.string(), v.null()),
});

export const trelloOverviewValidator = v.object({
  webUrl: v.union(v.string(), v.null()),
  stages: v.array(
    v.object({
      name: v.string(),
      /** Itens diretamente dentro da pasta da etapa. */
      count: v.number(),
      modifiedAt: v.union(v.number(), v.null()),
      webUrl: v.union(v.string(), v.null()),
      /** Itens da etapa (até 50); null quando a pasta tem mais que isso. */
      items: v.union(v.array(trelloEntryValidator), v.null()),
    })
  ),
  /** Arquivos soltos na raiz da pasta TRELLO (atalhos, .rar). */
  looseFiles: v.number(),
});

export type TrelloOverview = Infer<typeof trelloOverviewValidator>;

function toEntry(item: GraphItem): Infer<typeof trelloEntryValidator> {
  const modified = item.lastModifiedDateTime ? Date.parse(item.lastModifiedDateTime) : NaN;
  return {
    name: item.name.normalize("NFC"),
    kind: item.folder ? "folder" : "file",
    modifiedAt: Number.isFinite(modified) ? modified : null,
    webUrl: item.webUrl ?? null,
  };
}

function stageRank(name: string): number {
  const key = name.toLocaleLowerCase("pt-BR");
  const index = STAGE_ORDER.findIndex((stage) => key.startsWith(stage.toLocaleLowerCase("pt-BR")));
  return index === -1 ? STAGE_ORDER.length : index;
}

function address(segments: readonly string[]): string {
  const path = segments.map((segment) => encodeURIComponent(segment.normalize("NFC"))).join("/");
  return `/sites/${SHAREPOINT_LIBRARIES.projetos.siteId}/drive/root:/${path}:`;
}

/** Até 200 itens da pasta (uma página do Graph), ordenados por nome. */
async function children(segments: readonly string[]): Promise<GraphItem[]> {
  const page = await graphJson<{ value: GraphItem[] }>({
    path: `${address(segments)}/children?$top=200&$select=${FIELDS}`,
    notFoundMessage: `Pasta não encontrada no SharePoint: ${segments.join("/")}`,
  });
  return page.value.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

export async function getTrelloOverview(): Promise<TrelloOverview> {
  const [root, top] = await Promise.all([
    graphJson<GraphItem>({
      path: `${address(TRELLO_PATH)}?$select=${FIELDS}`,
      notFoundMessage: `Pasta não encontrada no SharePoint: ${TRELLO_PATH.join("/")}`,
    }),
    children(TRELLO_PATH),
  ]);
  const folders = top.filter((item) => item.folder);

  const stages = await Promise.all(
    folders.map(async (folder) => {
      const { name, modifiedAt, webUrl } = toEntry(folder);
      const count = folder.folder?.childCount ?? 0;
      const items =
        count <= MAX_LISTED_ITEMS
          ? (await children([...TRELLO_PATH, folder.name])).map(toEntry)
          : null;
      return { name, count, modifiedAt, webUrl, items };
    })
  );
  stages.sort(
    (a, b) => stageRank(a.name) - stageRank(b.name) || a.name.localeCompare(b.name, "pt-BR")
  );

  return { webUrl: root.webUrl ?? null, stages, looseFiles: top.length - folders.length };
}

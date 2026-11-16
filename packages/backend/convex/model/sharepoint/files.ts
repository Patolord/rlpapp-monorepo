import { ConvexError, v, type Infer } from "convex/values";
import { graphFetch, graphJson, sharepointError } from "./graph";
import {
  SHAREPOINT_LIBRARIES,
  isAllowedTopFolder,
  resolvePath,
  type LibraryKey,
  type ResolvedPath,
} from "./libraries";

/**
 * Operações de arquivos nas bibliotecas do SharePoint (ver libraries.ts),
 * pelo Microsoft Graph. Todo caminho passa por `resolvePath`, que só aceita as
 * pastas liberadas; a raiz de uma biblioteca lista apenas essas pastas.
 *
 * Busca pelo Graph (`/search`) não funciona com a permissão Sites.Selected
 * (responde 500); por isso a listagem aceita um filtro por nome.
 */

/** Maior texto devolvido inline em `readFile`; acima disso vem só o link. */
export const MAX_INLINE_TEXT_BYTES = 1024 * 1024;
/** Upload simples do Graph aceita até 4 MB; fica uma folga. */
export const MAX_UPLOAD_BYTES = 3.5 * 1024 * 1024;
const PAGE_SIZE = 200;
const ITEM_FIELDS = "id,name,size,webUrl,eTag,lastModifiedDateTime,lastModifiedBy,folder,file";

const TEXT_EXTENSIONS = new Set([
  "json",
  "txt",
  "csv",
  "md",
  "xml",
  "html",
  "htm",
  "svg",
  "log",
  "ini",
  "yaml",
  "yml",
]);

export const sharepointItemValidator = v.object({
  name: v.string(),
  /** Caminho relativo à biblioteca, para usar nas outras ferramentas. */
  path: v.string(),
  kind: v.union(v.literal("folder"), v.literal("file")),
  /** Bytes (em pastas, o total do conteúdo). */
  size: v.number(),
  /** Epoch ms. */
  modifiedAt: v.union(v.number(), v.null()),
  modifiedBy: v.union(v.string(), v.null()),
  /** Itens dentro da pasta; null para arquivos. */
  childCount: v.union(v.number(), v.null()),
  mimeType: v.union(v.string(), v.null()),
  webUrl: v.union(v.string(), v.null()),
  /** Versão atual; informe em `ifMatch` para substituir o arquivo. */
  eTag: v.union(v.string(), v.null()),
});

export type SharepointItem = Infer<typeof sharepointItemValidator>;

interface GraphItem {
  id: string;
  name: string;
  size?: number;
  webUrl?: string;
  eTag?: string;
  lastModifiedDateTime?: string;
  lastModifiedBy?: { user?: { displayName?: string } };
  folder?: { childCount?: number };
  file?: { mimeType?: string };
  "@microsoft.graph.downloadUrl"?: string;
}

interface GraphPage {
  value: GraphItem[];
  "@odata.nextLink"?: string;
}

function encodeSegments(segments: string[]): string {
  return segments.map((segment) => encodeURIComponent(segment)).join("/");
}

function driveRoot(library: LibraryKey): string {
  return `/sites/${SHAREPOINT_LIBRARIES[library].siteId}/drive/root`;
}

/** `/sites/{site}/drive/root:/A/B:` (ou a raiz). */
function itemAddress(resolved: ResolvedPath): string {
  if (resolved.segments.length === 0) return driveRoot(resolved.library);
  return `${driveRoot(resolved.library)}:/${encodeSegments(resolved.segments)}:`;
}

function toItem(item: GraphItem, path: string): SharepointItem {
  const modified = item.lastModifiedDateTime ? Date.parse(item.lastModifiedDateTime) : NaN;
  return {
    name: item.name,
    path,
    kind: item.folder ? "folder" : "file",
    size: item.size ?? 0,
    modifiedAt: Number.isFinite(modified) ? modified : null,
    modifiedBy: item.lastModifiedBy?.user?.displayName ?? null,
    childCount: item.folder ? (item.folder.childCount ?? 0) : null,
    mimeType: item.file?.mimeType ?? null,
    webUrl: item.webUrl ?? null,
    eTag: item.eTag ?? null,
  };
}

function matchesName(name: string, nameContains: string | undefined): boolean {
  if (!nameContains) return true;
  const fold = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLocaleLowerCase("pt-BR");
  return fold(name).includes(fold(nameContains.trim()));
}

function skipTokenOf(nextLink: string | undefined): string | null {
  if (!nextLink) return null;
  try {
    return new URL(nextLink).searchParams.get("$skiptoken");
  } catch {
    return null;
  }
}

export const listFolderResultValidator = v.object({
  library: v.string(),
  path: v.string(),
  items: v.array(sharepointItemValidator),
  /** Passe em `cursor` para a próxima página; null quando acabou. */
  nextCursor: v.union(v.string(), v.null()),
});

/**
 * Conteúdo de uma pasta, uma página de até 200 itens. Na raiz da biblioteca
 * devolve só as pastas liberadas para leitura. `nameContains` filtra pelo nome
 * (sem acento nem caixa) dentro da página.
 */
export async function listFolder(args: {
  library: LibraryKey;
  path?: string;
  nameContains?: string;
  cursor?: string;
}): Promise<Infer<typeof listFolderResultValidator>> {
  const resolved = resolvePath(args.library, args.path ?? "", "read");
  if (resolved.segments.length === 0) {
    const page = await graphJson<GraphPage>({
      path: `${driveRoot(args.library)}/children?$top=${PAGE_SIZE}&$select=${ITEM_FIELDS}`,
    });
    const items = page.value
      .filter((item) => item.folder && isAllowedTopFolder(args.library, item.name, "read"))
      .filter((item) => matchesName(item.name, args.nameContains))
      .map((item) => toItem(item, item.name.normalize("NFC")));
    return { library: args.library, path: "", items, nextCursor: null };
  }

  let query = `$top=${PAGE_SIZE}&$select=${ITEM_FIELDS}`;
  if (args.cursor) query += `&$skiptoken=${encodeURIComponent(args.cursor)}`;
  const page = await graphJson<GraphPage>({
    path: `${itemAddress(resolved)}/children?${query}`,
    notFoundMessage: `Pasta não encontrada: ${resolved.path}`,
  });
  const items = page.value
    .filter((item) => matchesName(item.name, args.nameContains))
    .map((item) => toItem(item, `${resolved.path}/${item.name.normalize("NFC")}`));
  return {
    library: args.library,
    path: resolved.path,
    items,
    nextCursor: skipTokenOf(page["@odata.nextLink"]),
  };
}

async function getGraphItem(resolved: ResolvedPath): Promise<GraphItem> {
  return await graphJson<GraphItem>({
    path: itemAddress(resolved),
    notFoundMessage: `Arquivo não encontrado: ${resolved.path}`,
  });
}

function isText(name: string, mimeType: string | undefined): boolean {
  const extension = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  if (TEXT_EXTENSIONS.has(extension)) return true;
  if (!mimeType) return false;
  return (
    mimeType.startsWith("text/") ||
    mimeType === "application/json" ||
    mimeType === "application/xml"
  );
}

export const readFileResultValidator = v.object({
  library: v.string(),
  item: sharepointItemValidator,
  /** Conteúdo de arquivos de texto até 1 MB (UTF-8); null nos demais. */
  text: v.union(v.string(), v.null()),
  /**
   * Para arquivos que não vêm como texto (PDF, planilhas, imagens): link
   * pré-autenticado para baixar, válido por cerca de 1 hora. Não compartilhe.
   */
  downloadUrl: v.union(v.string(), v.null()),
});

export async function readFile(args: {
  library: LibraryKey;
  path: string;
}): Promise<Infer<typeof readFileResultValidator>> {
  const resolved = resolvePath(args.library, args.path, "read");
  if (resolved.segments.length === 0) {
    throw new ConvexError({ code: "INVALID_PATH", message: "Informe o caminho de um arquivo." });
  }
  const graphItem = await getGraphItem(resolved);
  if (graphItem.folder) {
    throw new ConvexError({
      code: "INVALID_PATH",
      message: `"${resolved.path}" é uma pasta; liste o conteúdo dela.`,
    });
  }
  const item = toItem(graphItem, resolved.path);
  const downloadUrl = graphItem["@microsoft.graph.downloadUrl"] ?? null;
  if (downloadUrl && item.size <= MAX_INLINE_TEXT_BYTES && isText(item.name, item.mimeType ?? undefined)) {
    // O link já é pré-autenticado e aponta para o SharePoint, não para o Graph.
    const response = await fetch(downloadUrl);
    if (!response.ok) {
      throw sharepointError("SHAREPOINT_ERROR", `Erro ao baixar o arquivo (${response.status}).`);
    }
    const text = new TextDecoder("utf-8").decode(await response.arrayBuffer()).replace(/^﻿/, "");
    return { library: args.library, item, text, downloadUrl: null };
  }
  return { library: args.library, item, text: null, downloadUrl };
}

function decodeBase64(base64: string): Uint8Array<ArrayBuffer> {
  const clean = base64.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean) || clean.length % 4 !== 0) {
    throw new ConvexError({ code: "INVALID_CONTENT", message: "contentBase64 não é base64 válido." });
  }
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export const writeFileResultValidator = v.object({
  library: v.string(),
  item: sharepointItemValidator,
  /** true quando substituiu um arquivo existente (`ifMatch`). */
  replaced: v.boolean(),
});

/**
 * Grava um arquivo numa pasta liberada para escrita. Sem `ifMatch`, só cria:
 * falha se já existir um item com o nome. Com `ifMatch` (o eTag lido antes),
 * substitui, e falha se o arquivo mudou desde a leitura. As pastas que faltam
 * no caminho são criadas pelo SharePoint.
 */
export async function writeFile(args: {
  library: LibraryKey;
  path: string;
  text?: string;
  contentBase64?: string;
  contentType?: string;
  ifMatch?: string;
}): Promise<Infer<typeof writeFileResultValidator>> {
  const resolved = resolvePath(args.library, args.path, "write");
  if ((args.text === undefined) === (args.contentBase64 === undefined)) {
    throw new ConvexError({
      code: "INVALID_CONTENT",
      message: "Informe o conteúdo em `text` ou em `contentBase64` (um dos dois).",
    });
  }
  const bytes: Uint8Array<ArrayBuffer> =
    args.text !== undefined ? new TextEncoder().encode(args.text) : decodeBase64(args.contentBase64!);
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new ConvexError({
      code: "CONTENT_TOO_LARGE",
      message: "Arquivo acima de 3,5 MB: envie arquivos grandes direto pelo SharePoint.",
    });
  }
  const replacing = args.ifMatch !== undefined;
  const headers: Record<string, string> = {
    "Content-Type":
      args.contentType ?? (args.text !== undefined ? "text/plain; charset=utf-8" : "application/octet-stream"),
  };
  if (replacing) headers["If-Match"] = args.ifMatch!;
  const conflict = replacing ? "replace" : "fail";
  const response = await graphFetch({
    method: "PUT",
    path: `${itemAddress(resolved)}/content?@microsoft.graph.conflictBehavior=${conflict}`,
    headers,
    body: bytes,
    notFoundMessage: replacing
      ? `Arquivo não encontrado para substituir: ${resolved.path}`
      : `Pasta não encontrada para ${resolved.path}`,
    conflictMessage: `Já existe "${resolved.path}". Para substituir, leia o arquivo e passe o eTag em ifMatch.`,
  });
  const saved = (await response.json()) as GraphItem;
  return { library: args.library, item: toItem(saved, resolved.path), replaced: replacing };
}

/** Cria uma pasta numa pasta liberada para escrita; falha se já existir. */
export async function createFolder(args: {
  library: LibraryKey;
  path: string;
}): Promise<{ library: string; item: SharepointItem }> {
  const resolved = resolvePath(args.library, args.path, "write");
  const parent: ResolvedPath = {
    library: resolved.library,
    segments: resolved.segments.slice(0, -1),
    path: resolved.segments.slice(0, -1).join("/"),
  };
  const name = resolved.segments[resolved.segments.length - 1]!;
  const created = await graphJson<GraphItem>({
    method: "POST",
    path: `${itemAddress(parent)}/children`,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      folder: {},
      "@microsoft.graph.conflictBehavior": "fail",
    }),
    notFoundMessage: `Pasta não encontrada: ${parent.path}`,
    conflictMessage: `Já existe um item chamado "${name}" em ${parent.path}.`,
  });
  return { library: args.library, item: toItem(created, resolved.path) };
}

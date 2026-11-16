import { ConvexError, v, type Infer } from "convex/values";

/**
 * Bibliotecas do SharePoint que o backend enxerga e, em cada uma, as pastas de
 * primeiro nível liberadas. O app do Entra ID ("RLP App - SharePoint
 * (backend)", permissão Sites.Selected) tem escrita no site Projetos e leitura
 * no Publico, cada um com a biblioteca "Documentos"; estas listas restringem
 * isso ainda mais, porque as bibliotecas guardam também pastas pessoais, RH e
 * financeiro que nenhum agente deve ver.
 *
 * Um caminho é relativo à raiz da biblioteca ("Projetos Orçamento/Bios/x.pdf")
 * e só vale se a primeira pasta estiver liberada. Para liberar outra pasta,
 * acrescente o nome exato dela aqui (escrita exige leitura também).
 */
export const libraryValidator = v.union(v.literal("projetos"), v.literal("publico"));

export type LibraryKey = Infer<typeof libraryValidator>;

interface LibraryConfig {
  label: string;
  siteId: string;
  webUrl: string;
  readFolders: readonly string[];
  /** Subconjunto de `readFolders`. */
  writeFolders: readonly string[];
}

export const SHAREPOINT_LIBRARIES: Record<LibraryKey, LibraryConfig> = {
  projetos: {
    label: "Projetos",
    siteId:
      "rlpengcombr.sharepoint.com,c2492a7a-71fa-4d06-b858-e8d561aedae1,5457ad79-e052-4ac4-9560-2a7200b9a764",
    webUrl: "https://rlpengcombr.sharepoint.com/sites/Projetos",
    readFolders: [
      "Projetos Orçamento",
      "PROJETOS GERAL",
      "PROJETOS DE REFRIGERAÇÃO",
      "Quadros elétricos para orçamento",
      "Padrões RLP",
      "Catalogos e Manuais Fornecedores",
      "Catálogos Extras",
    ],
    writeFolders: ["Projetos Orçamento"],
  },
  publico: {
    label: "Publico",
    siteId:
      "rlpengcombr.sharepoint.com,a60c59c2-da9a-4843-bce8-bbdb090b2eda,5457ad79-e052-4ac4-9560-2a7200b9a764",
    webUrl: "https://rlpengcombr.sharepoint.com/sites/Publico",
    readFolders: ["Formularios e modelos", "CREA - Laudos e ART Pressurização"],
    writeFolders: [],
  },
};

export type Access = "read" | "write";

/** Caminho já validado: segmentos com a primeira pasta na grafia configurada. */
export interface ResolvedPath {
  library: LibraryKey;
  segments: string[];
  /** Segmentos unidos por "/"; "" é a raiz da biblioteca. */
  path: string;
}

const MAX_PATH_LENGTH = 400;
/** Caracteres que o SharePoint não aceita em nomes (":" também delimita caminhos no Graph). */
const INVALID_NAME_CHARS = /["*:<>?|\u0000-\u001f\u007f]/;

function invalidPath(message: string): ConvexError<{ code: string; message: string }> {
  return new ConvexError({ code: "INVALID_PATH", message });
}

function folderKey(name: string): string {
  return name.normalize("NFC").toLocaleLowerCase("pt-BR");
}

function allowedFolders(library: LibraryKey, access: Access): readonly string[] {
  const config = SHAREPOINT_LIBRARIES[library];
  return access === "write" ? config.writeFolders : config.readFolders;
}

/** Pastas de primeiro nível liberadas, na grafia configurada. */
export function listAllowedFolders(library: LibraryKey, access: Access): string[] {
  return [...allowedFolders(library, access)];
}

/** Se a pasta de primeiro nível (comparação sem caixa, Unicode NFC) está liberada. */
export function isAllowedTopFolder(library: LibraryKey, name: string, access: Access): boolean {
  const key = folderKey(name);
  return allowedFolders(library, access).some((folder) => folderKey(folder) === key);
}

/** Divide e valida um caminho, sem checar as pastas liberadas. */
export function splitPath(raw: string): string[] {
  const normalized = raw.normalize("NFC").replace(/\\/g, "/").trim();
  if (normalized.length > MAX_PATH_LENGTH) {
    throw invalidPath(`Caminho com mais de ${MAX_PATH_LENGTH} caracteres.`);
  }
  const segments = normalized
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
  for (const segment of segments) {
    if (segment === "." || segment === "..") {
      throw invalidPath('Caminho não pode ter "." nem "..".');
    }
    if (INVALID_NAME_CHARS.test(segment)) {
      throw invalidPath(`Nome inválido no SharePoint: "${segment}".`);
    }
  }
  return segments;
}

/**
 * Valida o caminho para leitura ou escrita na biblioteca. A raiz ("") só vale
 * para leitura (a listagem mostra apenas as pastas liberadas); escrever exige
 * ao menos uma pasta liberada e o nome dentro dela.
 */
export function resolvePath(library: LibraryKey, raw: string, access: Access): ResolvedPath {
  const segments = splitPath(raw);
  if (segments.length === 0) {
    if (access === "write") {
      throw invalidPath("Informe o caminho dentro de uma pasta liberada para escrita.");
    }
    return { library, segments, path: "" };
  }
  const folders = allowedFolders(library, access);
  const top = folders.find((folder) => folderKey(folder) === folderKey(segments[0]!));
  if (!top) {
    const label = SHAREPOINT_LIBRARIES[library].label;
    const list = folders.length > 0 ? folders.join(", ") : "nenhuma";
    throw new ConvexError({
      code: "FOLDER_NOT_ALLOWED",
      message:
        access === "write"
          ? `Escrita em ${label} só é permitida nas pastas: ${list}.`
          : `Leitura em ${label} só é permitida nas pastas: ${list}.`,
    });
  }
  if (access === "write" && segments.length < 2) {
    throw invalidPath("Não é possível substituir a própria pasta liberada; informe um nome dentro dela.");
  }
  const resolved = [top, ...segments.slice(1)];
  return { library, segments: resolved, path: resolved.join("/") };
}

import { ConvexError, v, type Infer } from "convex/values";

/**
 * Bibliotecas do SharePoint que o backend enxerga e, em cada uma, as pastas
 * liberadas. O app do Entra ID ("RLP App - SharePoint (backend)", permissão
 * Sites.Selected) tem escrita no site Projetos e leitura no Publico, cada um
 * com a biblioteca "Documentos"; estas listas restringem isso ainda mais,
 * porque as bibliotecas guardam também pastas pessoais, RH e financeiro que
 * nenhum agente deve ver.
 *
 * Cada pasta liberada é um caminho a partir da raiz da biblioteca
 * ("z/Orçamentos/TRELLO"); `*` vale por um nome qualquer naquele nível (o ano
 * em "*\/Propostas/PRC"). Um caminho pedido ("Projetos Orçamento/Bios/x.pdf")
 * só vale se começar por uma delas; as pastas acima (como "z") continuam
 * fechadas. Para liberar outra, acrescente o caminho exato aqui (escrita exige
 * leitura também).
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
      // Orçamentos em andamento, como um quadro: Para Fazer/<ano>/<Cliente - Obra>,
      // Em Andamento/<nº PRC - Cliente - Obra>, Concluído, Obsoletos e Pasta
      // Padrão (modelo). O .takeoff.json fica na pasta de cada orçamento.
      "z/Orçamentos/TRELLO",
      "Projetos Orçamento",
      "PROJETOS GERAL",
      "PROJETOS DE REFRIGERAÇÃO",
      "Quadros elétricos para orçamento",
      "Padrões RLP",
      "Catalogos e Manuais Fornecedores",
      "Catálogos Extras",
    ],
    writeFolders: ["z/Orçamentos/TRELLO", "Projetos Orçamento"],
  },
  publico: {
    label: "Publico",
    siteId:
      "rlpengcombr.sharepoint.com,a60c59c2-da9a-4843-bce8-bbdb090b2eda,5457ad79-e052-4ac4-9560-2a7200b9a764",
    webUrl: "https://rlpengcombr.sharepoint.com/sites/Publico",
    readFolders: [
      // Propostas prontas: <ano>/Propostas/PRC/<mês>/<nº PRC - Cliente - Obra>.
      // O resto das pastas de ano (RH, financeiro) continua fechado.
      "*/Propostas/PRC",
      "Formularios e modelos",
      "CREA - Laudos e ART Pressurização",
    ],
    writeFolders: [],
  },
};

/** Segmento de uma pasta liberada que vale por qualquer nome naquele nível. */
export const ANY_FOLDER = "*";

export type Access = "read" | "write";

/** Caminho já validado: a parte da pasta liberada vem na grafia configurada. */
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

/** Pastas liberadas, na grafia configurada (podem ter `*`). */
export function listAllowedFolders(library: LibraryKey, access: Access): string[] {
  return [...allowedFolders(library, access)];
}

/**
 * Se `segments` começa pela pasta liberada `folder`, devolve esses segmentos
 * com a grafia configurada (o `*` mantém o nome pedido); senão, null.
 */
function matchAllowed(folder: string, segments: string[]): string[] | null {
  const pattern = folder.split("/");
  if (segments.length < pattern.length) return null;
  const canonical: string[] = [];
  for (let i = 0; i < pattern.length; i++) {
    const expected = pattern[i]!;
    const given = segments[i]!;
    if (expected === ANY_FOLDER) canonical.push(given);
    else if (folderKey(expected) === folderKey(given)) canonical.push(expected);
    else return null;
  }
  return canonical;
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
 * uma pasta liberada e o nome dentro dela.
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
  for (const folder of folders) {
    const prefix = matchAllowed(folder, segments);
    if (!prefix) continue;
    if (access === "write" && segments.length === prefix.length) {
      throw invalidPath(
        "Não é possível substituir a própria pasta liberada; informe um nome dentro dela."
      );
    }
    const resolved = [...prefix, ...segments.slice(prefix.length)];
    return { library, segments: resolved, path: resolved.join("/") };
  }
  const label = SHAREPOINT_LIBRARIES[library].label;
  const list = folders.length > 0 ? folders.join(", ") : "nenhuma";
  throw new ConvexError({
    code: "FOLDER_NOT_ALLOWED",
    message:
      access === "write"
        ? `Escrita em ${label} só é permitida nas pastas: ${list}.`
        : `Leitura em ${label} só é permitida nas pastas: ${list} (* = qualquer nome, como o ano).`,
  });
}

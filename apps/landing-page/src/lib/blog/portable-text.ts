/**
 * Conversor de um subconjunto de Markdown para Portable Text (o formato de
 * corpo de texto usado pelo Sanity e renderizado por `@portabletext/react`).
 *
 * Os artigos locais do blog são escritos em Markdown simples e convertidos
 * aqui, de forma determinística (mesmo texto → mesmas `_key`s), para que o
 * mesmo conteúdo sirva ao site e à importação para o Sanity
 * (`scripts/seed-sanity-blog.ts`) sem divergência.
 *
 * Suportado:
 *   ## Título          → h2
 *   ### Subtítulo      → h3
 *   > citação          → blockquote
 *   - item / * item    → lista com marcadores
 *   1. item            → lista numerada
 *   **negrito**, *itálico*, [texto](url)
 *   linhas consecutivas → um parágrafo; linha em branco separa blocos
 */

export type PortableSpan = {
  _type: "span";
  _key: string;
  text: string;
  marks: string[];
};

export type PortableLinkDef = {
  _type: "link";
  _key: string;
  href: string;
};

export type PortableBlock = {
  _type: "block";
  _key: string;
  style: "normal" | "h2" | "h3" | "blockquote";
  markDefs: PortableLinkDef[];
  children: PortableSpan[];
  listItem?: "bullet" | "number";
  level?: number;
};

type LineKind =
  | { kind: "h2"; text: string }
  | { kind: "h3"; text: string }
  | { kind: "quote"; text: string }
  | { kind: "bullet"; text: string }
  | { kind: "number"; text: string }
  | { kind: "text"; text: string }
  | { kind: "blank" };

function classify(line: string): LineKind {
  const trimmed = line.trim();
  if (trimmed === "") return { kind: "blank" };
  if (trimmed.startsWith("### ")) return { kind: "h3", text: trimmed.slice(4) };
  if (trimmed.startsWith("## ")) return { kind: "h2", text: trimmed.slice(3) };
  if (trimmed.startsWith("> ")) return { kind: "quote", text: trimmed.slice(2) };
  if (/^[-*]\s+/.test(trimmed))
    return { kind: "bullet", text: trimmed.replace(/^[-*]\s+/, "") };
  if (/^\d+[.)]\s+/.test(trimmed))
    return { kind: "number", text: trimmed.replace(/^\d+[.)]\s+/, "") };
  return { kind: "text", text: trimmed };
}

const INLINE_RE = /(\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\(([^)\s]+)\))/g;

/** Converte o texto de uma linha/parágrafo em spans + markDefs. */
function parseInline(
  text: string,
  blockKey: string
): { children: PortableSpan[]; markDefs: PortableLinkDef[] } {
  const children: PortableSpan[] = [];
  const markDefs: PortableLinkDef[] = [];
  let last = 0;
  let spanIndex = 0;

  const push = (value: string, marks: string[]) => {
    if (!value) return;
    children.push({
      _type: "span",
      _key: `${blockKey}s${spanIndex++}`,
      text: value,
      marks,
    });
  };

  for (const match of text.matchAll(INLINE_RE)) {
    const start = match.index ?? 0;
    push(text.slice(last, start), []);

    if (match[2] !== undefined) {
      push(match[2], ["strong"]);
    } else if (match[3] !== undefined) {
      push(match[3], ["em"]);
    } else if (match[4] !== undefined && match[5] !== undefined) {
      const linkKey = `${blockKey}l${markDefs.length}`;
      markDefs.push({ _type: "link", _key: linkKey, href: match[5] });
      push(match[4], [linkKey]);
    }
    last = start + match[0].length;
  }
  push(text.slice(last), []);

  if (children.length === 0) push("", []);
  return { children, markDefs };
}

/**
 * Converte Markdown (subconjunto acima) em blocos Portable Text.
 * `keyPrefix` garante chaves únicas e estáveis por artigo.
 */
export function markdownToPortableText(
  markdown: string,
  keyPrefix = "b"
): PortableBlock[] {
  const blocks: PortableBlock[] = [];
  let paragraph: string[] = [];

  const makeBlock = (
    style: PortableBlock["style"],
    text: string,
    list?: PortableBlock["listItem"]
  ) => {
    const key = `${keyPrefix}${blocks.length}`;
    const { children, markDefs } = parseInline(text, key);
    const block: PortableBlock = {
      _type: "block",
      _key: key,
      style,
      markDefs,
      children,
    };
    if (list) {
      block.listItem = list;
      block.level = 1;
    }
    blocks.push(block);
  };

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    makeBlock("normal", paragraph.join(" "));
    paragraph = [];
  };

  for (const rawLine of markdown.replace(/\r\n?/g, "\n").split("\n")) {
    const line = classify(rawLine);
    switch (line.kind) {
      case "blank":
        flushParagraph();
        break;
      case "h2":
        flushParagraph();
        makeBlock("h2", line.text);
        break;
      case "h3":
        flushParagraph();
        makeBlock("h3", line.text);
        break;
      case "quote":
        flushParagraph();
        makeBlock("blockquote", line.text);
        break;
      case "bullet":
        flushParagraph();
        makeBlock("normal", line.text, "bullet");
        break;
      case "number":
        flushParagraph();
        makeBlock("normal", line.text, "number");
        break;
      case "text":
        paragraph.push(line.text);
        break;
    }
  }
  flushParagraph();

  return blocks;
}

/** Texto corrido de um corpo Portable Text (para contagem de palavras/SEO). */
export function portableTextToPlain(
  blocks: ReadonlyArray<{ _type?: string; children?: unknown }>
): string {
  return blocks
    .map((block) =>
      block._type === "block" && Array.isArray(block.children)
        ? block.children
            .map((child) =>
              typeof (child as { text?: unknown }).text === "string"
                ? (child as { text: string }).text
                : ""
            )
            .join("")
        : ""
    )
    .filter(Boolean)
    .join("\n");
}

/** Minutos de leitura estimados (≈ 200 palavras/min, mínimo 1). */
export function readingMinutes(words: number): number {
  return Math.max(1, Math.round(words / 200));
}

export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

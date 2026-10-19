import { markdownToPortableText } from "../portable-text";
import type { LocalPost, LocalPostInput } from "../types";

import arCondicionadoVerao from "./2026-01-ar-condicionado-verao";
import pressurizacaoEscadas from "./2026-02-pressurizacao-escadas-it-13";
import pmoc from "./2026-03-pmoc-o-que-e";
import hvacCronograma from "./2026-04-hvac-na-obra-cronograma";
import avcbVencido from "./2026-05-avcb-vencido-sindico";
import vrfSplitChiller from "./2026-06-vrf-split-ou-chiller";
import qualidadeDoAr from "./2026-07-qualidade-do-ar-interior";
import deteccaoAlarme from "./2026-08-deteccao-alarme-nbr-17240";
import preventivaCorretiva from "./2026-09-preventiva-ou-corretiva";
import comissionamentoTab from "./2026-10-comissionamento-tab-entrega";

/**
 * Artigos publicados a partir do repositório (ver `lib/blog/index.ts`).
 * Para criar um novo: copie um arquivo desta pasta, ajuste os campos e
 * registre-o aqui. Para levar os artigos ao Sanity: `pnpm blog:seed`.
 */
const inputs: LocalPostInput[] = [
  arCondicionadoVerao,
  pressurizacaoEscadas,
  pmoc,
  hvacCronograma,
  avcbVencido,
  vrfSplitChiller,
  qualidadeDoAr,
  deteccaoAlarme,
  preventivaCorretiva,
  comissionamentoTab,
];

function definePost(input: LocalPostInput): LocalPost {
  return {
    ...input,
    blocks: markdownToPortableText(input.body.trim(), `${input.slug}-`),
  };
}

const slugs = new Set<string>();
for (const input of inputs) {
  if (slugs.has(input.slug)) {
    throw new Error(`[blog] slug duplicado: ${input.slug}`);
  }
  slugs.add(input.slug);
}

export const localPosts: LocalPost[] = inputs.map(definePost);

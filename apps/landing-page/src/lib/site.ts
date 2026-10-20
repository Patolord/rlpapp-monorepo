/**
 * Dados canônicos do site — fonte única para metadata, sitemap, robots.txt,
 * JSON-LD e links de contato. Alterar aqui reflete em todas as páginas.
 *
 * O domínio canônico é o `www` (o apex `rlpeng.com.br` redireciona para ele
 * na Vercel). Para trocar, basta ajustar `NEXT_PUBLIC_SITE_URL`.
 */

export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.rlpeng.com.br"
).replace(/\/+$/, "");

export const SITE_NAME = "RLP Engenharia";
export const LEGAL_NAME = "RLP Engenharia e Instalações Ltda.";

export const DEFAULT_TITLE =
  "RLP Engenharia | HVAC e Proteção contra Incêndio em São Paulo";
export const DEFAULT_DESCRIPTION =
  "Equipes flexíveis de HVAC para construtoras em SP. Climatização, pressurização de escadas, AVCB e ventilação. +27 anos de experiência. Orçamento rápido.";

/** Imagem padrão para compartilhamento (1200×630, gerada de technician2.jpeg). */
export const OG_IMAGE = {
  url: "/og-image.jpg",
  width: 1200,
  height: 630,
  alt: "Técnico da RLP Engenharia inspecionando um sistema de ar-condicionado",
} as const;

export const LOGO_PATH = "/logorlp.png";

export const WHATSAPP_NUMBER = "5511985782307";
export const PHONE_E164 = "+5511985782307";
export const PHONE_DISPLAY = "(11) 98578-2307";

export const ADDRESS = {
  street: "Rua Melo Palheta, 172",
  neighborhood: "Água Branca",
  city: "São Paulo",
  region: "SP",
  postalCode: "05002-030",
  country: "BR",
} as const;

/** Coordenadas aproximadas do endereço (as mesmas do mapa incorporado). */
export const GEO = { latitude: -23.529, longitude: -46.6764 } as const;

export const SOCIAL_LINKS = {
  linkedin:
    "https://www.linkedin.com/company/rlp-engenharia-e-instalações-ltda/?originalSubdomain=br",
  instagram: "https://www.instagram.com/rlpengenharia/",
} as const;

export const FOUNDING_YEAR = 1998;

/** URL absoluta a partir de um caminho do site. */
export function absoluteUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Link do WhatsApp com mensagem pré-preenchida. */
export function whatsappUrl(message: string): string {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

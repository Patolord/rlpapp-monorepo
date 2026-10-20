import {
  ADDRESS,
  DEFAULT_DESCRIPTION,
  FOUNDING_YEAR,
  GEO,
  LEGAL_NAME,
  LOGO_PATH,
  OG_IMAGE,
  PHONE_E164,
  SITE_NAME,
  SITE_URL,
  SOCIAL_LINKS,
  absoluteUrl,
} from "./site";

export const ORGANIZATION_ID = `${SITE_URL}/#organization`;
export const WEBSITE_ID = `${SITE_URL}/#website`;

type JsonLdObject = Record<string, unknown>;

export type BreadcrumbItem = { name: string; path: string };
export type FaqItem = { question: string; answer: string };

/** Empresa (HVACBusiness é um subtipo de LocalBusiness/Organization no schema.org). */
export function organizationJsonLd(): JsonLdObject {
  return {
    "@type": "HVACBusiness",
    "@id": ORGANIZATION_ID,
    name: SITE_NAME,
    legalName: LEGAL_NAME,
    url: SITE_URL,
    logo: {
      "@type": "ImageObject",
      url: absoluteUrl(LOGO_PATH),
      width: 1024,
      height: 235,
    },
    image: absoluteUrl(OG_IMAGE.url),
    description: DEFAULT_DESCRIPTION,
    telephone: PHONE_E164,
    foundingDate: String(FOUNDING_YEAR),
    founder: { "@type": "Person", name: "Reinaldo Luiz Pellegrini" },
    address: {
      "@type": "PostalAddress",
      streetAddress: `${ADDRESS.street} - ${ADDRESS.neighborhood}`,
      addressLocality: ADDRESS.city,
      addressRegion: ADDRESS.region,
      postalCode: ADDRESS.postalCode,
      addressCountry: ADDRESS.country,
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: GEO.latitude,
      longitude: GEO.longitude,
    },
    areaServed: { "@type": "State", name: "São Paulo" },
    sameAs: Object.values(SOCIAL_LINKS),
    contactPoint: {
      "@type": "ContactPoint",
      telephone: PHONE_E164,
      contactType: "sales",
      areaServed: "BR",
      availableLanguage: ["pt-BR"],
    },
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: "Serviços de HVAC e proteção contra incêndio",
      itemListElement: SERVICES.map((service) => ({
        "@type": "Offer",
        itemOffered: {
          "@type": "Service",
          name: service.name,
          url: absoluteUrl(service.path),
        },
      })),
    },
  };
}

export function websiteJsonLd(): JsonLdObject {
  return {
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    url: SITE_URL,
    name: SITE_NAME,
    inLanguage: "pt-BR",
    publisher: { "@id": ORGANIZATION_ID },
  };
}

export function breadcrumbJsonLd(items: BreadcrumbItem[]): JsonLdObject {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export function faqJsonLd(items: FaqItem[]): JsonLdObject {
  return {
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
}

/** Serviços oferecidos — usados no catálogo da empresa e na página /servicos. */
export const SERVICES = [
  {
    name: "Climatização",
    path: "/servicos#climatizacao",
    description:
      "Projeto e instalação de sistemas de ar-condicionado (VRF, split e chillers), ventilação e qualidade do ar interior para obras e operações.",
  },
  {
    name: "Refrigeração",
    path: "/servicos#refrigeracao",
    description:
      "Sistemas de refrigeração e câmaras frigoríficas para indústrias alimentícias, centros de distribuição, supermercados e hospitais.",
  },
  {
    name: "Pressurização de escadas",
    path: "/servicos#pressurizacao",
    description:
      "Sistemas de pressurização de escadas de emergência conforme NBR 9077 e IT 13 do Corpo de Bombeiros, com testes em campo e laudos para AVCB.",
  },
  {
    name: "Extração de fumaça",
    path: "/servicos#extracao",
    description:
      "Sistemas de exaustão e controle de fumaça para evacuação segura em caso de incêndio.",
  },
  {
    name: "Detecção e alarme de incêndio",
    path: "/servicos#deteccao",
    description:
      "Detecção precoce de fumaça, calor e gases com alarme integrado à pressurização, sprinklers e plano de evacuação, com emissão de ARTs.",
  },
] as const;

export function servicesJsonLd(): JsonLdObject {
  return {
    "@type": "ItemList",
    name: "Serviços da RLP Engenharia",
    itemListElement: SERVICES.map((service, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: {
        "@type": "Service",
        name: service.name,
        description: service.description,
        url: absoluteUrl(service.path),
        provider: { "@id": ORGANIZATION_ID },
        areaServed: { "@type": "State", name: "São Paulo" },
      },
    })),
  };
}

/**
 * Open Graph de uma página. O Next não faz merge profundo de `openGraph`:
 * quando a página define o seu, perde siteName/locale/images do layout —
 * por isso os padrões são reaplicados aqui.
 */
export function pageOpenGraph(overrides: {
  url: string;
  title: string;
  description?: string;
  type?: "website" | "article";
  images?: { url: string; width?: number; height?: number; alt?: string }[];
}) {
  return {
    type: "website" as const,
    siteName: SITE_NAME,
    locale: "pt_BR",
    images: [OG_IMAGE],
    ...overrides,
  };
}

/** Agrupa vários objetos num único JSON-LD (`@graph`). */
export function jsonLdGraph(...items: JsonLdObject[]): JsonLdObject {
  return { "@context": "https://schema.org", "@graph": items };
}

/** Corta um texto para uma meta description (~155 caracteres) sem quebrar palavras. */
export function truncateDescription(text: string, max = 155): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 80 ? lastSpace : cut.length).replace(/[,;:.\s]+$/, "")}…`;
}

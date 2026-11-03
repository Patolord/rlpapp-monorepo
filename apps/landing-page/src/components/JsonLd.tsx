const SITE_URL = "https://rlpeng.com.br";

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "HVACBusiness",
  "@id": `${SITE_URL}/#organization`,
  name: "RLP Engenharia",
  url: SITE_URL,
  logo: `${SITE_URL}/logorlp.png`,
  image: `${SITE_URL}/hero.jpg`,
  description:
    "Equipes flexíveis de HVAC para construtoras em São Paulo. Climatização, pressurização de escadas, AVCB, ventilação e refrigeração industrial.",
  telephone: "+55 11 98578-2307",
  foundingDate: "1998",
  address: {
    "@type": "PostalAddress",
    addressLocality: "São Paulo",
    addressRegion: "SP",
    addressCountry: "BR",
  },
  areaServed: {
    "@type": "State",
    name: "São Paulo",
  },
  knowsAbout: [
    "Climatização",
    "Pressurização de escadas",
    "AVCB",
    "Ventilação mecânica",
    "Exaustão",
    "Refrigeração industrial",
    "Detecção de incêndio",
  ],
  sameAs: [
    "https://www.instagram.com/rlpengenharia/",
    "https://www.linkedin.com/company/rlp-engenharia-e-instalações-ltda/",
  ],
};

export default function JsonLd() {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
    />
  );
}

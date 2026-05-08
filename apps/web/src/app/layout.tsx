import type { Metadata } from "next";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import FloatingBubbleMenu from "@/components/FloatingBubbleMenu";
import Script from "next/script";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { Playfair_Display } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://rlpeng.com.br"),
  title: "RLP Engenharia | HVAC e Proteção contra Incêndio em São Paulo",
  description:
    "Equipes flexíveis de HVAC para construtoras em SP. Climatização, pressurização de escadas, AVCB e ventilação. +27 anos de experiência. Orçamento rápido.",
  keywords:
    "HVAC São Paulo, climatização obra, pressurização escadas, AVCB, ar condicionado industrial, construtoras SP, refrigeração industrial, ventilação mecânica",
  authors: [{ name: "RLP Engenharia" }],
  robots: "index, follow",
  icons: {
    icon: "/favicon.ico",
  },
  openGraph: {
    title: "RLP Engenharia | Especialistas em HVAC e Proteção contra Incêndio",
    description:
      "Equipes flexíveis de HVAC prontas para sua obra. Climatização, pressurização, AVCB. +27 anos de experiência em São Paulo.",
    url: "https://rlpeng.com.br",
    siteName: "RLP Engenharia",
    locale: "pt_BR",
    type: "website",
    images: [
      {
        url: "/hero.jpg",
        width: 1200,
        height: 630,
        alt: "RLP Engenharia - Soluções em HVAC",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "RLP Engenharia | HVAC e Proteção contra Incêndio",
    description:
      "Equipes flexíveis de HVAC para construtoras. +27 anos de experiência em São Paulo.",
    images: ["/hero.jpg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={playfair.variable}>
      <head>
        <Script
          defer
          src="https://cloud.umami.is/script.js"
          data-website-id="c3a38c2a-499e-4298-ab4c-c0c6525c8955"
          strategy="afterInteractive"
        />
      </head>
      <body>
        <NuqsAdapter>
          <Header />
          {children}
          <Footer />
          <FloatingBubbleMenu />
        </NuqsAdapter>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}

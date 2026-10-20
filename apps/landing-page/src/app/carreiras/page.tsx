import type { Metadata } from "next";
import CarreirasContent from "@/components/CarreirasContent";
import JsonLd from "@/components/JsonLd";
import { breadcrumbJsonLd, jsonLdGraph, pageOpenGraph } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Carreiras e Banco de Talentos",
  description:
    "Vagas para engenheiros, técnicos de refrigeração e climatização, analistas e equipe de apoio. Envie seu currículo para o banco de talentos da RLP Engenharia.",
  alternates: { canonical: "/carreiras" },
  openGraph: pageOpenGraph({
    url: "/carreiras",
    title: "Carreiras e Banco de Talentos | RLP Engenharia",
    description:
      "Trabalhe com HVAC e proteção contra incêndio em São Paulo: engenheiros, técnicos, analistas e equipe de apoio.",
  }),
};

export default function CarreirasPage() {
  return (
    <>
      <JsonLd
        data={jsonLdGraph(
          breadcrumbJsonLd([
            { name: "Início", path: "/" },
            { name: "Carreiras", path: "/carreiras" },
          ])
        )}
      />
      <CarreirasContent />
    </>
  );
}

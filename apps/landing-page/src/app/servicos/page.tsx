import type { Metadata } from "next";
import ServicosClient from "./servicos-client";

const title =
  "Pressurização de Escadas, Climatização VRF e Extração de Fumaça em SP";
const description =
  "Climatização VRF, pressurização de escadas, extração de fumaça, detecção de incêndio e AVCB para construtoras em São Paulo. Projeto, instalação e laudo com a RLP Engenharia.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: { title, description },
};

export default function ServicosPage() {
  return <ServicosClient />;
}

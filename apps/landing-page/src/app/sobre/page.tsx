import type { Metadata } from "next";
import SobreClient from "./sobre-client";

const title =
  "Sobre a RLP Engenharia, HVAC e Proteção contra Incêndio desde 1998";
const description =
  "Conheça a RLP Engenharia: desde 1998 em climatização, pressurização de escadas e proteção contra incêndio para construtoras e condomínios em São Paulo. Equipe própria e compromisso com as normas.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: { title, description },
};

export default function SobrePage() {
  return <SobreClient />;
}

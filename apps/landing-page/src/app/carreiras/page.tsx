import type { Metadata } from "next";
import CarreirasClient from "./carreiras-client";

const title = "Carreiras na RLP Engenharia, vagas em HVAC e pressurização";
const description =
  "Trabalhe na RLP Engenharia: vagas para engenheiros, técnicos e instaladores de HVAC, climatização e pressurização de escadas em São Paulo. Envie seu currículo.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: { title, description },
};

export default function CarreirasPage() {
  return <CarreirasClient />;
}

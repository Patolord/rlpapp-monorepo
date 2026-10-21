import type { Metadata } from "next";
import PoliticaPrivacidadeClient from "./politica-privacidade-client";

const title = "Política de Privacidade";
const description =
  "Como a RLP Engenharia coleta, usa e protege os dados pessoais de visitantes e clientes, conforme a LGPD.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: { title, description },
};

export default function PoliticaPrivacidadePage() {
  return <PoliticaPrivacidadeClient />;
}

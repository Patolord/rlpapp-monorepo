import type { Metadata } from "next";
import ManutencaoClient from "./manutencao-client";

const title =
  "Manutenção de Ar-Condicionado e Pressurização para Condomínios em SP";
const description =
  "Manutenção preventiva de ar-condicionado e pressurização de escadas para condomínios e administradoras em São Paulo. PMOC em dia, AVCB vencido regularizado e contrato sem surpresas.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: { title, description },
};

export default function ManutencaoPage() {
  return <ManutencaoClient />;
}

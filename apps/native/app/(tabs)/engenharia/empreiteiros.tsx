import { CONTRACTOR_ADAPTER } from "@/components/engenharia/party/adapter";
import { PartyListScreen } from "@/components/engenharia/party/party-list-screen";

export default function EmpreiteirosScreen() {
  return <PartyListScreen adapter={CONTRACTOR_ADAPTER} subtitle="Gestão de empreiteiros e contatos" />;
}

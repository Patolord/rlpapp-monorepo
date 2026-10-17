import { CUSTOMER_ADAPTER } from "@/components/engenharia/party/adapter";
import { PartyListScreen } from "@/components/engenharia/party/party-list-screen";

export default function ClientesScreen() {
  return <PartyListScreen adapter={CUSTOMER_ADAPTER} subtitle="Gestão de clientes e contatos" />;
}

import { Redirect } from "expo-router";

// Rota default do grupo de tabs: o dashboard de estoque é a primeira tela.
export default function TabsIndex() {
  return <Redirect href="/(drawer)/(tabs)/estoque" />;
}

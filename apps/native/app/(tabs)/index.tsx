import { Redirect } from "expo-router";

import { LoadingScreen } from "@/components/auth/loading-screen";
import { homeFor } from "@/components/inicio/homes";
import { Screen } from "@/components/ui";
import { useProfile } from "@/lib/profile";

/** Início por perfil (fichas S3–S8). O cliente abre direto em Minhas obras. */
export default function InicioScreen() {
  const me = useProfile();
  if (me === undefined || me === null) return <LoadingScreen />;
  if (me.profile === "cliente") return <Redirect href="/(tabs)/portal" />;
  const Home = homeFor(me.profile);
  return (
    <Screen>
      <Home user={me.user} />
    </Screen>
  );
}

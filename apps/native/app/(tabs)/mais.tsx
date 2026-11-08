import { LoadingScreen } from "@/components/auth/loading-screen";
import { MaisScreen } from "@/components/mais/mais-screen";
import { Screen } from "@/components/ui";
import { useProfile } from "@/lib/profile";

export default function MaisTab() {
  const me = useProfile();
  if (!me) return <LoadingScreen />;
  return (
    <Screen>
      <MaisScreen user={me.user} profile={me.profile} />
    </Screen>
  );
}

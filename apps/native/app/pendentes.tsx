import { Stack } from "expo-router";

import { PendingRecordsView } from "@/components/campo/pending-records-view";

export default function PendingRecordsScreen() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Registros Pendentes" }} />
      <PendingRecordsView />
    </>
  );
}

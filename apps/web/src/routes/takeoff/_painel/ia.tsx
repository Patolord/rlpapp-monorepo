import { api } from "@rlpapp/backend/convex/_generated/api";
import { agentMonthKey } from "@rlpapp/shared/takeoff/agentModels";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useRef, useState } from "react";

import { AuthShell } from "@/components/auth-shell";
import {
  AiSettingsCard,
  type AiSettingsDraft,
  draftToSettings,
  settingsToDraft,
} from "@/components/takeoff/ai-settings-card";
import { AiUsageSection, recentMonthOptions } from "@/components/takeoff/ai-usage-section";
import { PublishBar, TakeoffPageHeader, usePublisher } from "@/components/takeoff/painel";
import { Skeleton } from "@/components/ui/skeleton";
import { useCan } from "@/hooks/use-can";

export const Route = createFileRoute("/takeoff/_painel/ia")({
  component: () => (
    <AuthShell>
      <TakeoffIaPage />
    </AuthShell>
  ),
});

function TakeoffIaPage() {
  const [now] = useState(() => Date.now());
  const currentMonth = useMemo(() => agentMonthKey(now), [now]);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const monthOptions = useMemo(() => recentMonthOptions(currentMonth), [currentMonth]);

  const dashboard = useQuery(api.takeoffAgent.getDashboard, {
    month: selectedMonth,
    now,
  });
  const saveSettings = useMutation(api.takeoffAgent.saveSettings);
  const canWrite = useCan("takeoff.config");
  const { busy, run } = usePublisher();

  const [draft, setDraft] = useState<AiSettingsDraft | null>(null);
  const [dirty, setDirty] = useState(false);
  const latest = useRef<AiSettingsDraft | null>(null);
  latest.current = draft;

  useEffect(() => {
    if (!dashboard) return;
    if (!dirty) {
      setDraft(settingsToDraft(dashboard.settings));
    }
  }, [dashboard, dirty]);

  const handleEdit = (next: AiSettingsDraft) => {
    setDirty(true);
    setDraft(next);
  };

  const handlePublish = () => {
    if (!draft) return;
    return run(async () => {
      const payload = draftToSettings(draft);
      const sent = JSON.stringify(draft);
      await saveSettings(payload);
      if (JSON.stringify(latest.current) === sent) {
        setDirty(false);
      }
    }, "Configurações da IA publicadas");
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <TakeoffPageHeader
        title="IA do RLP Takeoff"
        description="Modelo, orçamentos mensais, instruções adicionais e acompanhamento de uso do agente embutido."
      />

      {!dashboard || !draft ? (
        <div className="space-y-4">
          <Skeleton className="h-72 w-full rounded-xl" />
          <div className="grid gap-4 sm:grid-cols-4">
            <Skeleton className="h-28 w-full rounded-xl" />
            <Skeleton className="h-28 w-full rounded-xl" />
            <Skeleton className="h-28 w-full rounded-xl" />
            <Skeleton className="h-28 w-full rounded-xl" />
          </div>
        </div>
      ) : (
        <>
          <AiSettingsCard
            draft={draft}
            meta={dashboard.meta}
            canWrite={canWrite}
            onChange={handleEdit}
          />
          <AiUsageSection
            data={dashboard}
            selectedMonth={selectedMonth}
            monthOptions={monthOptions}
            onSelectMonth={setSelectedMonth}
          />
        </>
      )}

      {canWrite && (
        <PublishBar
          dirty={dirty}
          busy={busy}
          disabled={!dashboard || !draft}
          onPublish={() => void handlePublish()}
          onDiscard={() => {
            if (dashboard) setDraft(settingsToDraft(dashboard.settings));
            setDirty(false);
          }}
        />
      )}
    </div>
  );
}

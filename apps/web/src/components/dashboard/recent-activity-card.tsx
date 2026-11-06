import { ScanLine } from "lucide-react";

import {
  DashboardCardTitle,
  ViewAllLink,
  cardCls,
  type Overview,
} from "@/components/dashboard/dashboard-card";

const actionLabels: Record<string, string> = {
  installed: "Equipamento instalado",
  tested: "Equipamento testado",
  finalized: "Equipamento finalizado",
  status_changed: "Status alterado",
  created: "Equipamento criado",
  updated: "Equipamento atualizado",
  assigned: "Equipamento atribuído",
  linked: "Equipamento vinculado",
  unlinked: "Equipamento desvinculado",
};

function relativeTime(from: number, now: number): string {
  const diff = Math.max(0, now - from);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `${minutes} min atrás`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h atrás`;
  const days = Math.floor(hours / 24);
  return `${days}d atrás`;
}

export function RecentActivityCard({
  activity,
  now,
}: {
  activity: Overview["recentActivity"];
  now: number;
}) {
  return (
    <div className={`${cardCls} p-6`}>
      <DashboardCardTitle title="Atividades recentes" action={<ViewAllLink />} />

      {activity.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-400">
          Nenhuma atividade registrada ainda.
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          {activity.map((item) => (
            <div key={item._id} className="flex items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-400">
                <ScanLine className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-900">
                  {actionLabels[item.action] ?? item.action}
                </p>
                <p className="truncate text-xs text-slate-400">
                  {item.equipmentLabel} · {relativeTime(item.createdAt, now)}
                </p>
              </div>
              <span className="shrink-0 rounded-full border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600">
                {item.projectName}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

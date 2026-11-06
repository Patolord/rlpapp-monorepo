import { Link } from "@tanstack/react-router";
import { CheckCircle2, ChevronRight } from "lucide-react";

import {
  DashboardCardTitle,
  ViewAllLink,
  cardCls,
  type Overview,
} from "@/components/dashboard/dashboard-card";

export function CriticalPendingCard({
  pending,
}: {
  pending: Overview["criticalPending"];
}) {
  const items = [
    {
      show: pending.overdueProjects > 0,
      critical: true,
      title: `${pending.overdueProjects} ${
        pending.overdueProjects === 1
          ? "obra está atrasada"
          : "obras estão atrasadas"
      }`,
      description: "Clique para ver detalhes",
    },
    {
      show: pending.environmentsWithoutEquipment > 0,
      critical: false,
      title: `${pending.environmentsWithoutEquipment} ambientes sem equipamento`,
      description: "Requerem atenção",
    },
    {
      show: pending.openWorkItems > 0,
      critical: false,
      title: `${pending.openWorkItems} itens de serviço abertos`,
      description: "Aguardando execução",
    },
  ].filter((i) => i.show);

  return (
    <div className={`${cardCls} p-6`}>
      <DashboardCardTitle title="Pendências críticas" action={<ViewAllLink />} />

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <CheckCircle2 className="size-8 text-slate-300" />
          <p className="text-sm text-slate-400">Nenhuma pendência crítica.</p>
        </div>
      ) : (
        <div className="mt-2 divide-y divide-slate-100">
          {items.map((item) => (
            <Link
              key={item.title}
              to="/engenharia/obras"
              className="group flex items-center gap-3 py-3.5"
            >
              <span
                className={
                  "size-1.5 shrink-0 rounded-full " +
                  (item.critical ? "bg-red-600" : "bg-slate-400")
                }
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-900">
                  {item.title}
                </p>
                <p className="truncate text-xs text-slate-400">
                  {item.description}
                </p>
              </div>
              <ChevronRight className="size-4 shrink-0 text-slate-300 group-hover:text-slate-400" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

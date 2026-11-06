import {
  DashboardCardTitle,
  cardCls,
  type Overview,
} from "@/components/dashboard/dashboard-card";

export function WeeklySummaryCard({
  summary,
}: {
  summary: Overview["weeklySummary"];
}) {
  const cells = [
    { value: summary.checklistsCompleted, label: "Checklists concluídos" },
    { value: summary.equipmentRegistered, label: "Equipamentos registrados" },
    { value: summary.environmentsUpdated, label: "Ambientes atualizados" },
    { value: summary.maintenanceLogs, label: "Registros de campo" },
  ];

  return (
    <div className={`${cardCls} p-6`}>
      <DashboardCardTitle
        title="Resumo semanal"
        action={
          <span className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-500">
            Esta semana
          </span>
        }
      />
      <div className="mt-5 grid grid-cols-2 sm:grid-cols-4">
        {cells.map((cell, i) => {
          const dividers = [
            "",
            "border-l border-slate-100 pl-5",
            "mt-6 sm:mt-0 sm:border-l sm:border-slate-100 sm:pl-5",
            "mt-6 border-l border-slate-100 pl-5 sm:mt-0",
          ];
          return (
          <div
            key={cell.label}
            className={`space-y-1.5 ${dividers[i]}`}
          >
            <p className="text-[26px] font-semibold leading-none tabular-nums text-slate-900">
              {cell.value}
            </p>
            <p className="text-xs text-slate-400">{cell.label}</p>
          </div>
          );
        })}
      </div>
    </div>
  );
}

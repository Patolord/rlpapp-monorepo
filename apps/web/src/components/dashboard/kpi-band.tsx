import { cardCls, eyebrowCls, type Overview } from "@/components/dashboard/dashboard-card";

function KpiCell({
  label,
  value,
  detail,
  index,
}: {
  label: string;
  value: string;
  detail: string;
  index: number;
}) {
  const dividers = [
    "",
    "border-l border-slate-100",
    "border-t border-slate-100 xl:border-t-0 xl:border-l",
    "border-l border-t border-slate-100 xl:border-t-0",
  ];

  return (
    <div className={`px-6 py-5 ${dividers[index]}`}>
      <p className="text-[30px] font-semibold leading-none tabular-nums text-slate-900">
        {value}
      </p>
      <p className={`mt-2.5 ${eyebrowCls}`}>{label}</p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </div>
  );
}

export function KpiBand({ overview }: { overview: Overview }) {
  const { kpis } = overview;

  const cells = [
    {
      label: "Obras ativas",
      value: kpis.activeProjects.toString(),
      detail:
        kpis.newProjectsThisMonth > 0
          ? `${kpis.newProjectsThisMonth} novas este mês`
          : "Nenhuma nova este mês",
    },
    {
      label: "Equipamentos",
      value: kpis.totalEquipment.toString(),
      detail:
        kpis.newEquipmentThisMonth > 0
          ? `${kpis.newEquipmentThisMonth} este mês`
          : "Cadastro nas obras",
    },
    {
      label: "Checklists",
      value: `${kpis.checklistCompliance}%`,
      detail: "Conformidade geral",
    },
    {
      label: "Códigos QR",
      value: kpis.qrTotal.toString(),
      detail: `${kpis.qrLinked} vinculados`,
    },
  ];

  return (
    <div className={`${cardCls} grid grid-cols-2 xl:grid-cols-4`}>
      {cells.map((cell, i) => (
        <KpiCell key={cell.label} index={i} {...cell} />
      ))}
    </div>
  );
}

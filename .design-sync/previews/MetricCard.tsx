import { MetricCard } from "@rlpapp/ui";

function IconPin() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="text-muted-foreground"
    >
      <path d="M12 21s-7-6.5-7-11a7 7 0 0 1 14 0c0 4.5-7 11-7 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

export function Default() {
  return <MetricCard title="Equipamentos Ativos" value="128" className="w-64" />;
}

export function WithIconAndDescription() {
  return (
    <MetricCard
      title="Torres Monitoradas"
      value="24"
      description="+3 desde o mês passado"
      icon={<IconPin />}
      className="w-64"
    />
  );
}

export function Row() {
  return (
    <div className="flex flex-wrap gap-4">
      <MetricCard title="Equipamentos Ativos" value="128" className="w-64" />
      <MetricCard
        title="Manutenções Pendentes"
        value="7"
        description="2 críticas"
        className="w-64"
      />
      <MetricCard
        title="Torres Monitoradas"
        value="24"
        icon={<IconPin />}
        className="w-64"
      />
    </div>
  );
}

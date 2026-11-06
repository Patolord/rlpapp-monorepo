function greetingForHour(hour: number): string {
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

export function DashboardHeader({
  firstName,
  now,
}: {
  firstName: string;
  now: number;
}) {
  const date = new Date(now);
  const greeting = greetingForHour(date.getHours());
  const dateLabel = date.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="space-y-1">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        {greeting}
        {firstName ? `, ${firstName}` : ""}
      </h1>
      <p className="text-sm capitalize text-slate-500">{dateLabel}</p>
    </div>
  );
}

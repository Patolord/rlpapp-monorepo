import { createFileRoute } from "@tanstack/react-router";

import { TimeClockMonthView } from "@/components/rh/time-clock/month-view";
import { todayDateKey } from "@/lib/rh/time-clock";

type MonthSearch = { ano?: number; mes?: number };

function parseInt(value: unknown, min: number, max: number): number | undefined {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : undefined;
}

export const Route = createFileRoute("/rh/ponto/mensal")({
  validateSearch: (search: Record<string, unknown>): MonthSearch => ({
    ano: parseInt(search.ano, 2000, 2100),
    mes: parseInt(search.mes, 1, 12),
  }),
  component: PontoMensalPage,
});

function PontoMensalPage() {
  const { ano, mes } = Route.useSearch();
  const navigate = Route.useNavigate();
  const today = todayDateKey();
  const year = ano ?? Number(today.slice(0, 4));
  const month = mes ?? Number(today.slice(5, 7));

  return (
    <TimeClockMonthView
      year={year}
      month={month}
      onChange={(next) =>
        void navigate({ search: { ano: next.year, mes: next.month }, replace: true })
      }
    />
  );
}

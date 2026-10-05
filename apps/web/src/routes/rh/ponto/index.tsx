import { createFileRoute } from "@tanstack/react-router";

import { TimeClockDayView } from "@/components/rh/time-clock/day-view";
import { isDateKey, todayDateKey } from "@/lib/rh/time-clock";

export const Route = createFileRoute("/rh/ponto/")({
  validateSearch: (search: Record<string, unknown>): { date?: string } => {
    const date = search.date;
    return typeof date === "string" && isDateKey(date) ? { date } : {};
  },
  component: PontoDiaPage,
});

function PontoDiaPage() {
  const { date } = Route.useSearch();
  const navigate = Route.useNavigate();
  const today = todayDateKey();
  const current = date ?? today;

  return (
    <TimeClockDayView
      date={current}
      onDateChange={(next) =>
        void navigate({
          search: next === today ? {} : { date: next },
          replace: true,
        })
      }
    />
  );
}

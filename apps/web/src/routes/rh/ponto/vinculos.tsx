import { createFileRoute } from "@tanstack/react-router";

import { TimeClockLinksView } from "@/components/rh/time-clock/links-view";

export const Route = createFileRoute("/rh/ponto/vinculos")({
  component: TimeClockLinksView,
});

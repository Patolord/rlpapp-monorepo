import { createFileRoute } from "@tanstack/react-router";

import { TimeClockLiveView } from "@/components/rh/time-clock/live-view";

export const Route = createFileRoute("/rh/ponto/")({
  component: TimeClockLiveView,
});

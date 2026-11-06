import { useState } from "react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";

import { CriticalPendingCard } from "@/components/dashboard/critical-pending-card";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { KpiBand } from "@/components/dashboard/kpi-band";
import { ProjectsCard } from "@/components/dashboard/projects-card";
import { RecentActivityCard } from "@/components/dashboard/recent-activity-card";
import { WeeklySummaryCard } from "@/components/dashboard/weekly-summary-card";

export const Route = createFileRoute("/app/")({
  component: DashboardPage,
});

function DashboardPage() {
  const [now] = useState(() => Date.now());
  const currentUser = useQuery(api.users.getCurrentUser);
  const overview = useQuery(api.dashboard.getDirectorOverview, { now });

  const firstName = currentUser?.name?.split(" ")[0] ?? "";

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <DashboardHeader firstName={firstName} now={now} />

      {overview === undefined ? (
        <DashboardSkeleton />
      ) : (
        <>
          <KpiBand overview={overview} />

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
            <ProjectsCard projects={overview.projects} now={now} />
            <CriticalPendingCard pending={overview.criticalPending} />
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <RecentActivityCard activity={overview.recentActivity} now={now} />
            <WeeklySummaryCard summary={overview.weeklySummary} />
          </div>
        </>
      )}
    </div>
  );
}

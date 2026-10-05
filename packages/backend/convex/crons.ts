import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Keeps the local time-clock mirror fresh. The action is a no-op when the
// RHID credentials are not configured on the deployment.
crons.interval(
  "rhid: sincronizar ponto",
  { minutes: 30 },
  internal.rhidSync.syncRecentFromCron,
  {},
);

export default crons;

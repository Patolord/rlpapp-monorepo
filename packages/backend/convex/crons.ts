import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Keeps the local time-clock mirror fresh. Both actions are no-ops when the
// RHID credentials are not configured or another sync is still running.
crons.interval(
  "rhid: ponto de hoje",
  { minutes: 5 },
  internal.rhidSync.syncTodayFromCron,
  {},
);

// 06:00 UTC = 03:00 America/Sao_Paulo: re-fetch the last 7 days to pick up
// late uploads from the RHID app and manual corrections.
crons.cron(
  "rhid: reconciliar 7 dias",
  "0 6 * * *",
  internal.rhidSync.syncRecentFromCron,
  {},
);

export default crons;

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

// 04:00 UTC = 01:00 America/Sao_Paulo: apaga o registro de chamadas MCP mais
// antigo que AGENT_TOKEN_CALL_RETENTION_DAYS (agentTokens.ts).
crons.cron(
  "agent tokens: expurgar chamadas antigas",
  "0 4 * * *",
  internal.agentTokens.purgeCalls,
  {},
);

export default crons;

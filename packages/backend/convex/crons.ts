import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// 04:00 UTC = 01:00 America/Sao_Paulo: apaga o registro de chamadas MCP mais
// antigo que AGENT_TOKEN_CALL_RETENTION_DAYS (model/identity/agentTokenCalls.ts).
crons.cron(
  "agent tokens: expurgar chamadas antigas",
  "0 4 * * *",
  internal.agentTokens.purgeCalls,
  {},
);

export default crons;

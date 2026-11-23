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

// 10:30 UTC = 07:30 America/Sao_Paulo: resumos de prazos vencidos, fila de
// revisão de preços e estoque baixo (avisos N10, N11 e N13). Só avisa quando
// há algo a dizer. O nome do cron só aceita ASCII (o deploy recusa acentos).
crons.cron(
  "avisos: resumo diario",
  "30 10 * * *",
  internal.notificationDigest.daily,
  {},
);

// Lembretes do ponto (N18 e N19) nos horários das Configurações do ponto.
// Alinhado em múltiplos de 5 min: o lembrete sai até 5 min depois do horário.
crons.cron(
  "ponto: lembretes",
  "*/5 * * * *",
  internal.timeClockReminders.run,
  {},
);

// Recibos do Expo: desliga o token de aparelho que desinstalou o app.
crons.interval(
  "avisos: recibos de push",
  { minutes: 15 },
  internal.push.checkReceipts,
  {},
);

// 04:30 UTC = 01:30 America/Sao_Paulo: avisos com mais de 60 dias saem do sino.
crons.cron(
  "avisos: expurgar antigos",
  "30 4 * * *",
  internal.push.purgeOld,
  {},
);

export default crons;

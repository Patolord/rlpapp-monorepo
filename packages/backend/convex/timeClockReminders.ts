/**
 * Lembretes do ponto (N18 entrada, N19 saída). O cron de 5 min chama `run`,
 * que só lê as configurações e sai quando não há lembrete vencido. A regra
 * fica em `model/hr/timeClockReminders.ts`.
 */

import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { sendDueTimeClockReminders } from "./model/hr/timeClockReminders";

export const run = internalMutation({
  args: {},
  returns: v.object({ entrada: v.number(), saida: v.number() }),
  handler: async (ctx) => await sendDueTimeClockReminders(ctx, Date.now()),
});

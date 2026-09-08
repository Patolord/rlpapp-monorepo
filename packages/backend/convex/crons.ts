import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
crons.interval("Atualizar ponto de hoje", { minutes: 5 }, internal.attendanceStore.tick, {});
// 06:00 UTC = 03:00 America/Sao_Paulo. Re-fetch late uploads and corrections.
crons.cron("Reconciliar sete dias de ponto", "0 6 * * *", internal.attendanceStore.reconcile, {});
export default crons;

/**
 * Coleta do RHID (rhid.com.br): autentica com a credencial de integração,
 * baixa o cadastro de ativos e as marcações do período e grava o espelho em
 * `timeClock*` / `rhid*`. Roda sob demanda (RH) e por cron.
 *
 * Usa `fetch` do runtime padrão do Convex (sem "use node").
 */

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, env, internalAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import {
  RHID_DEFAULT_COMPANY_ID,
  RHID_TOKEN_TTL_MS,
  RhidError,
  assertDateKey,
  enumerateDateKeys,
  fetchCheckIns,
  fetchRoster,
  rhidLogin,
  toBrtDateKey,
  todayDateKey,
} from "./lib/rh/rhid";

/** Período máximo por sincronização (evita respostas gigantes do RHID). */
export const MAX_SYNC_DAYS = 62;
/** Uma sync "running" há mais que isto é considerada travada e pode ser refeita. */
const STALE_RUN_MS = 10 * 60 * 1000;

export type SyncTrigger = "manual" | "cron";

export type SyncSummary = {
  from: string;
  to: string;
  people: number;
  worksites: number;
  punches: number;
  days: number;
  inserted: number;
  updated: number;
  deleted: number;
  skipped: number;
};

const syncSummaryValidator = v.object({
  from: v.string(),
  to: v.string(),
  people: v.number(),
  worksites: v.number(),
  punches: v.number(),
  days: v.number(),
  inserted: v.number(),
  updated: v.number(),
  deleted: v.number(),
  skipped: v.number(),
});

export function isRhidConfigured(): boolean {
  return Boolean(env.RHID_EMAIL && env.RHID_PASSWORD);
}

function companyId(): number {
  const raw = env.RHID_COMPANY_ID;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : RHID_DEFAULT_COMPANY_ID;
}

async function obtainToken(ctx: ActionCtx, forceLogin: boolean): Promise<string> {
  if (!forceLogin) {
    const session = await ctx.runQuery(internal.timeClock.getSession, {});
    if (
      session.accessToken &&
      session.tokenObtainedAt &&
      Date.now() - session.tokenObtainedAt < RHID_TOKEN_TTL_MS
    ) {
      return session.accessToken;
    }
  }
  const email = env.RHID_EMAIL;
  const password = env.RHID_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "Integração RHID não configurada: defina RHID_EMAIL e RHID_PASSWORD no Convex"
    );
  }
  const token = await rhidLogin(email, password);
  await ctx.runMutation(internal.timeClock.storeToken, { accessToken: token });
  return token;
}

/** Executa `fn` com um token válido; em sessão expirada, reloga uma vez. */
async function withSession<T>(
  ctx: ActionCtx,
  fn: (token: string) => Promise<T>
): Promise<T> {
  const token = await obtainToken(ctx, false);
  try {
    return await fn(token);
  } catch (error) {
    if (error instanceof RhidError && error.sessionExpired) {
      await ctx.runMutation(internal.timeClock.storeToken, { accessToken: null });
      const fresh = await obtainToken(ctx, true);
      return await fn(fresh);
    }
    throw error;
  }
}

export async function runSync(
  ctx: ActionCtx,
  args: { from: string; to: string; trigger: SyncTrigger }
): Promise<SyncSummary> {
  assertDateKey(args.from, "Data inicial");
  assertDateKey(args.to, "Data final");
  const dates = enumerateDateKeys(args.from, args.to);
  if (dates.length > MAX_SYNC_DAYS) {
    throw new Error(`Período máximo por sincronização: ${MAX_SYNC_DAYS} dias`);
  }

  const session = await ctx.runQuery(internal.timeClock.getSession, {});
  if (
    session.running &&
    session.lastSyncStartedAt &&
    Date.now() - session.lastSyncStartedAt < STALE_RUN_MS
  ) {
    throw new Error("Já existe uma sincronização em andamento");
  }

  await ctx.runMutation(internal.timeClock.markSyncStarted, {
    from: args.from,
    to: args.to,
    trigger: args.trigger,
  });

  try {
    const roster = await withSession(ctx, (token) => fetchRoster(token));
    const checkIns = await withSession(ctx, (token) =>
      fetchCheckIns(token, { from: args.from, to: args.to }, companyId())
    );
    const syncedAt = Date.now();

    await ctx.runMutation(internal.timeClock.upsertPeopleBatch, {
      people: roster,
      syncedAt,
      fromRoster: true,
    });
    const rosterIds = new Set(roster.map((person) => person.rhidPersonId));
    const extraPeople = checkIns.people.filter(
      (person) => !rosterIds.has(person.rhidPersonId)
    );
    if (extraPeople.length > 0) {
      await ctx.runMutation(internal.timeClock.upsertPeopleBatch, {
        people: extraPeople,
        syncedAt,
        fromRoster: false,
      });
    }

    if (checkIns.worksites.length > 0) {
      await ctx.runMutation(internal.timeClock.upsertWorksitesBatch, {
        worksites: checkIns.worksites,
        syncedAt,
      });
    }

    const summary: SyncSummary = {
      from: args.from,
      to: args.to,
      people: roster.length + extraPeople.length,
      worksites: checkIns.worksites.length,
      punches: checkIns.punches.length,
      days: dates.length,
      inserted: 0,
      updated: 0,
      deleted: 0,
      skipped: checkIns.skipped,
    };

    for (const date of dates) {
      const dayPunches = checkIns.punches.filter((punch) => punch.date === date);
      const result = await ctx.runMutation(internal.timeClock.replaceDay, {
        date,
        punches: dayPunches,
        syncedAt,
      });
      summary.inserted += result.inserted;
      summary.updated += result.updated;
      summary.deleted += result.deleted;
    }

    await ctx.runMutation(internal.timeClock.markSyncFinished, {
      status: "success",
      punches: summary.punches,
      people: summary.people,
    });
    return summary;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    await ctx.runMutation(internal.timeClock.markSyncFinished, {
      status: "error",
      error: message,
    });
    throw error;
  }
}

/** Sincroniza um período (padrão: hoje). Apenas RH/admin. */
export const syncRange = action({
  args: {
    from: v.optional(v.string()),
    to: v.optional(v.string()),
  },
  returns: syncSummaryValidator,
  handler: async (ctx, args): Promise<SyncSummary> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    await ctx.runQuery(internal.timeClock.assertHrWriteAccess, {});

    const today = todayDateKey();
    return await runSync(ctx, {
      from: args.from ?? today,
      to: args.to ?? args.from ?? today,
      trigger: "manual",
    });
  },
});

/**
 * Cron: mantém ontem e hoje atualizados (ontem cobre marcações feitas depois
 * da última rodada do dia anterior). Sem credencial, não faz nada.
 */
export const syncRecentFromCron = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    if (!isRhidConfigured()) {
      console.log("rhidSync: RHID_EMAIL/RHID_PASSWORD não configurados; cron ignorado");
      return null;
    }
    const now = Date.now();
    const summary = await runSync(ctx, {
      from: toBrtDateKey(now - 24 * 60 * 60 * 1000),
      to: toBrtDateKey(now),
      trigger: "cron",
    });
    console.log(
      `rhidSync: ${summary.punches} marcações, ${summary.people} pessoas (${summary.from}..${summary.to})`
    );
    return null;
  },
});

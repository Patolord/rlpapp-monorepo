import { v } from "convex/values";
import { timeClockGeofenceStatus, timeClockPunchKind } from "../../schema/hr";

/**
 * Validadores de retorno do painel de ponto (`convex/timeClock.ts`): regras,
 * presença do dia, situação "agora" e homem-dia do mês.
 */

export const timeClockSettingsValidator = v.object({
  manDayCostCents: v.number(),
  photoRequired: v.boolean(),
  locationRequired: v.boolean(),
  duplicateWindowMinutes: v.number(),
});

const liveStatusValidator = v.union(
  v.literal("on_site"),
  v.literal("lunch"),
  v.literal("left"),
  v.literal("absent")
);

const dayPersonValidator = v.object({
  userId: v.id("users"),
  name: v.string(),
  login: v.union(v.string(), v.null()),
  present: v.boolean(),
  firstPunchAt: v.union(v.number(), v.null()),
  lastPunchAt: v.union(v.number(), v.null()),
  lastKind: v.union(timeClockPunchKind, v.null()),
  punchCount: v.number(),
  projectId: v.union(v.id("projects"), v.null()),
  projectName: v.union(v.string(), v.null()),
  photoPunchId: v.union(v.id("clockPunches"), v.null()),
});

const dayPunchValidator = v.object({
  _id: v.id("clockPunches"),
  userId: v.id("users"),
  personName: v.string(),
  punchedAt: v.number(),
  timeLabel: v.string(),
  sequence: v.number(),
  kind: timeClockPunchKind,
  latitude: v.union(v.number(), v.null()),
  longitude: v.union(v.number(), v.null()),
  hasPhoto: v.boolean(),
  projectId: v.union(v.id("projects"), v.null()),
  projectName: v.union(v.string(), v.null()),
  geofenceStatus: timeClockGeofenceStatus,
  offline: v.boolean(),
});

const dayWorksiteValidator = v.object({
  projectId: v.id("projects"),
  name: v.string(),
  latitude: v.number(),
  longitude: v.number(),
  radiusMeters: v.number(),
  peopleCount: v.number(),
  punchCount: v.number(),
});

export const timeClockDayValidator = v.object({
  date: v.string(),
  people: v.array(dayPersonValidator),
  punches: v.array(dayPunchValidator),
  worksites: v.array(dayWorksiteValidator),
  summary: v.object({
    total: v.number(),
    present: v.number(),
    absent: v.number(),
    punches: v.number(),
    byKind: v.object({
      entrada: v.number(),
      almoco_saida: v.number(),
      almoco_retorno: v.number(),
      saida: v.number(),
    }),
  }),
});

const livePersonValidator = v.object({
  userId: v.id("users"),
  name: v.string(),
  login: v.union(v.string(), v.null()),
  status: liveStatusValidator,
  /** Instante da última marcação (desde quando está nessa situação). */
  since: v.union(v.number(), v.null()),
  lastKind: v.union(timeClockPunchKind, v.null()),
  lastTimeLabel: v.union(v.string(), v.null()),
  projectId: v.union(v.id("projects"), v.null()),
  projectName: v.union(v.string(), v.null()),
  locationExact: v.boolean(),
  latitude: v.union(v.number(), v.null()),
  longitude: v.union(v.number(), v.null()),
  photoPunchId: v.union(v.id("clockPunches"), v.null()),
  punches: v.array(
    v.object({
      timeLabel: v.string(),
      kind: timeClockPunchKind,
      projectName: v.union(v.string(), v.null()),
    })
  ),
});

const liveWorksiteValidator = v.object({
  projectId: v.id("projects"),
  name: v.string(),
  latitude: v.number(),
  longitude: v.number(),
  radiusMeters: v.number(),
  onSite: v.number(),
  lunch: v.number(),
  left: v.number(),
  people: v.array(
    v.object({
      userId: v.id("users"),
      name: v.string(),
      status: liveStatusValidator,
      since: v.union(v.number(), v.null()),
      locationExact: v.boolean(),
    })
  ),
});

export const timeClockLiveStatusValidator = v.object({
  date: v.string(),
  people: v.array(livePersonValidator),
  worksites: v.array(liveWorksiteValidator),
  summary: v.object({
    total: v.number(),
    onSite: v.number(),
    lunch: v.number(),
    left: v.number(),
    absent: v.number(),
    outsideFence: v.number(),
  }),
});

export const timeClockMonthStatsValidator = v.object({
  from: v.string(),
  to: v.string(),
  manDayCostCents: v.number(),
  totalManDays: v.number(),
  uniquePeople: v.number(),
  uniqueWorksites: v.number(),
  byDate: v.array(v.object({ date: v.string(), presentCount: v.number() })),
  byPerson: v.array(
    v.object({
      userId: v.id("users"),
      personName: v.string(),
      totalDays: v.number(),
      worksites: v.array(
        v.object({
          projectId: v.union(v.id("projects"), v.null()),
          projectName: v.union(v.string(), v.null()),
          days: v.number(),
        })
      ),
    })
  ),
  byWorksite: v.array(
    v.object({
      projectId: v.union(v.id("projects"), v.null()),
      projectName: v.union(v.string(), v.null()),
      totalManDays: v.number(),
      uniquePeople: v.number(),
      people: v.array(
        v.object({ userId: v.id("users"), personName: v.string(), days: v.number() })
      ),
    })
  ),
});

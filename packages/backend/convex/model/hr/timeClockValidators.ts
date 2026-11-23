import { v } from "convex/values";
import {
  timeClockDeclarableRole,
  timeClockGeofenceStatus,
  timeClockPunchKind,
  timeClockPunchRole,
  timeClockRequestStatus,
  timeClockRoleBasis,
  timeClockWorkSchedule,
} from "../../schema/hr";

/**
 * Validadores de retorno do painel de ponto (`convex/timeClock.ts`): regras,
 * presença do dia, situação "agora" e homem-dia do mês.
 */

export const timeClockSettingsValidator = v.object({
  manDayCostCents: v.number(),
  photoRequired: v.boolean(),
  locationRequired: v.boolean(),
  duplicateWindowMinutes: v.number(),
  schedule: timeClockWorkSchedule,
});

export const liveStatusValidator = v.union(
  v.literal("on_site"),
  v.literal("lunch"),
  v.literal("away"),
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
  lastKind: v.union(timeClockPunchRole, v.null()),
  status: liveStatusValidator,
  /** Pendências que pedem o RH (marcação faltando, a mais, horário informado). */
  issueCount: v.number(),
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
  /** Papel na leitura do dia. */
  kind: timeClockPunchRole,
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
    issues: v.number(),
  }),
});

const livePersonValidator = v.object({
  userId: v.id("users"),
  name: v.string(),
  login: v.union(v.string(), v.null()),
  status: liveStatusValidator,
  /** Instante da última marcação (desde quando está nessa situação). */
  since: v.union(v.number(), v.null()),
  lastKind: v.union(timeClockPunchRole, v.null()),
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
      kind: timeClockPunchRole,
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
  away: v.number(),
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
    away: v.number(),
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

// ---------------------------------------------------------------------------
// Leitura do dia (app e painel)
// ---------------------------------------------------------------------------

export const dayDetailValidator = v.object({
  date: v.string(),
  open: v.boolean(),
  status: liveStatusValidator,
  items: v.array(
    v.object({
      id: v.string(),
      source: v.union(v.literal("punch"), v.literal("request")),
      punchId: v.union(v.id("clockPunches"), v.null()),
      requestId: v.union(v.id("clockPunchRequests"), v.null()),
      minute: v.number(),
      timeLabel: v.string(),
      role: timeClockPunchRole,
      basis: timeClockRoleBasis,
      geofenceStatus: v.union(timeClockGeofenceStatus, v.null()),
      worksiteName: v.union(v.string(), v.null()),
      offline: v.boolean(),
      hasPhoto: v.boolean(),
    })
  ),
  issues: v.array(
    v.object({
      code: v.union(
        v.literal("missing"),
        v.literal("no_lunch"),
        v.literal("extra"),
        v.literal("pending_request"),
        v.literal("short_lunch")
      ),
      severity: v.union(v.literal("action"), v.literal("info")),
      slot: v.union(timeClockPunchKind, v.null()),
      itemId: v.union(v.string(), v.null()),
      message: v.string(),
    })
  ),
});

export const requestOriginValidator = v.union(
  v.literal("app_prompt"),
  v.literal("app_manual"),
  v.literal("rh")
);

export const personDayValidator = v.object({
  personName: v.string(),
  schedule: timeClockWorkSchedule,
  day: dayDetailValidator,
  adjustments: v.array(
    v.object({
      _id: v.id("clockPunchAdjustments"),
      punchId: v.id("clockPunches"),
      punchTimeLabel: v.string(),
      action: v.union(v.literal("set_role"), v.literal("set_aside"), v.literal("clear")),
      role: v.union(timeClockDeclarableRole, v.null()),
      reason: v.string(),
      byName: v.string(),
      at: v.number(),
    })
  ),
  requests: v.array(
    v.object({
      _id: v.id("clockPunchRequests"),
      role: timeClockDeclarableRole,
      minute: v.number(),
      timeLabel: v.string(),
      status: timeClockRequestStatus,
      origin: requestOriginValidator,
      note: v.union(v.string(), v.null()),
      reviewNote: v.union(v.string(), v.null()),
      createdAt: v.number(),
    })
  ),
});

export const pendingRequestValidator = v.object({
  _id: v.id("clockPunchRequests"),
  userId: v.id("users"),
  personName: v.string(),
  date: v.string(),
  role: timeClockDeclarableRole,
  minute: v.number(),
  timeLabel: v.string(),
  origin: requestOriginValidator,
  note: v.union(v.string(), v.null()),
  createdAt: v.number(),
});

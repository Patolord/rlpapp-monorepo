/**
 * Marcação de ponto pelo app RLP (`convex/timeClockPunch.ts`).
 *
 * Regras puras (checagem de cerca, número sequencial/hash do comprovante e
 * duplicidade) e, no fim do arquivo, o registro da marcação e as listas da
 * tela de marcação.
 */

import { ConvexError } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { hasPermission } from "../../lib/rbac";
import {
  assertDateKey,
  punchKindForSequence,
  toBrtDateKey,
  toBrtTimeLabel,
  type GeofenceStatus,
  type PunchKind,
} from "./timeClock";
import {
  getPunchByClientId,
  getSettings,
  listGeofencedProjects,
  listUserDayPunches,
  nextNsr,
  recomputeDaySummary,
} from "./timeClockDb";

export type { GeofenceStatus } from "./timeClock";

export const GEOFENCE_STATUS_LABEL: Record<GeofenceStatus, string> = {
  not_controlled: "Não controla",
  inside: "Dentro da cerca",
  outside: "Fora da cerca",
};

/** Raio padrão de uma cerca nova. */
export const DEFAULT_GEOFENCE_RADIUS_METERS = 200;
/**
 * Formatos aceitos na foto da marcação (o app envia JPEG). Só imagens raster:
 * SVG pode carregar script e é recusado no registro e na entrega.
 */
export const PUNCH_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export function isPunchPhotoType(contentType: string | null | undefined): boolean {
  const base = (contentType ?? "").split(";")[0]!.trim().toLowerCase();
  return (PUNCH_PHOTO_TYPES as readonly string[]).includes(base);
}

/** Foto capturada há mais tempo que isto não vale mais. */
export const PHOTO_MAX_AGE_MS = 5 * 60 * 1000;
/** Tolerância entre o relógio do aparelho e o do servidor. */
export const MAX_CLOCK_SKEW_MS = 24 * 60 * 60 * 1000;

export type GeofenceLike = {
  latitude: number;
  longitude: number;
  radiusMeters: number;
};

/** Raio aceito numa cerca de obra (metros). */
export const MIN_GEOFENCE_RADIUS_METERS = 20;
export const MAX_GEOFENCE_RADIUS_METERS = 5000;

const EARTH_RADIUS_METERS = 6_371_000;

/** Distância em metros entre duas coordenadas (haversine). */
export function distanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(a)));
}

export type GeofenceMatch<G extends GeofenceLike> = {
  status: GeofenceStatus;
  /** Cerca escolhida: a que contém o ponto ou, fora de todas, a mais próxima. */
  worksite: G | null;
  distanceMeters: number | null;
};

/**
 * Classifica uma posição contra as cercas ativas. Sem cercas cadastradas ou
 * sem posição, não há controle. Dentro de mais de uma, vence a mais próxima
 * do centro (desempate pelo menor raio).
 */
export function classifyGeofence<G extends GeofenceLike>(
  position: { latitude: number; longitude: number } | null | undefined,
  geofences: G[]
): GeofenceMatch<G> {
  if (!position || geofences.length === 0) {
    return { status: "not_controlled", worksite: null, distanceMeters: null };
  }
  let best: { worksite: G; distance: number; inside: boolean } | null = null;
  for (const geofence of geofences) {
    const distance = distanceMeters(
      position.latitude,
      position.longitude,
      geofence.latitude,
      geofence.longitude
    );
    const inside = distance <= Math.max(0, geofence.radiusMeters);
    if (
      !best ||
      (inside && !best.inside) ||
      (inside === best.inside &&
        (distance < best.distance ||
          (distance === best.distance && geofence.radiusMeters < best.worksite.radiusMeters)))
    ) {
      best = { worksite: geofence, distance, inside };
    }
  }
  if (!best) {
    return { status: "not_controlled", worksite: null, distanceMeters: null };
  }
  return {
    status: best.inside ? "inside" : "outside",
    worksite: best.worksite,
    distanceMeters: Math.round(best.distance),
  };
}

/** Marcação dentro da janela de repetição do mesmo usuário é recusada. */
export function isDuplicatePunch(
  lastPunchedAt: number | null | undefined,
  now: number,
  windowMinutes: number
): boolean {
  if (lastPunchedAt === null || lastPunchedAt === undefined) return false;
  if (!Number.isFinite(windowMinutes) || windowMinutes <= 0) return false;
  return now - lastPunchedAt < windowMinutes * 60 * 1000;
}

/** Posição no dia (0..n) e tipo derivado, a partir das marcações já gravadas. */
export function nextSequence(existingCount: number): {
  sequence: number;
  kind: PunchKind;
} {
  const sequence = Math.max(0, existingCount);
  return { sequence, kind: punchKindForSequence(sequence) };
}

// ---------------------------------------------------------------------------
// Comprovante: NSR + hash
// ---------------------------------------------------------------------------

export type PunchHashInput = {
  nsr: number;
  employerId: string;
  /** Id de quem marcou (usuário do app). */
  personId: string;
  cpf?: string | null;
  punchedAt: number;
};

/** Texto canônico que entra no hash (uma linha, campos separados por "|"). */
export function punchHashPayload(input: PunchHashInput): string {
  return [
    String(input.nsr),
    input.employerId,
    input.personId,
    input.cpf ?? "",
    new Date(input.punchedAt).toISOString(),
  ].join("|");
}

export function buildPunchHash(input: PunchHashInput): string {
  return sha256Hex(punchHashPayload(input));
}

// SHA-256 puro (determinístico, sem dependências) para rodar em mutations.
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

export function sha256Hex(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const bitLength = bytes.length * 8;
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x1_0000_0000), false);
  view.setUint32(paddedLength - 4, bitLength >>> 0, false);

  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const w = new Uint32Array(64);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15]!, 7) ^ rotr(w[i - 15]!, 18) ^ (w[i - 15]! >>> 3);
      const s1 = rotr(w[i - 2]!, 17) ^ rotr(w[i - 2]!, 19) ^ (w[i - 2]! >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h as unknown as [
      number, number, number, number, number, number, number, number,
    ];
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[i]! + w[i]!) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0]! + a) >>> 0;
    h[1] = (h[1]! + b) >>> 0;
    h[2] = (h[2]! + c) >>> 0;
    h[3] = (h[3]! + d) >>> 0;
    h[4] = (h[4]! + e) >>> 0;
    h[5] = (h[5]! + f) >>> 0;
    h[6] = (h[6]! + g) >>> 0;
    h[7] = (h[7]! + hh) >>> 0;
  }

  return Array.from(h, (value) => value.toString(16).padStart(8, "0")).join("");
}

// ---------------------------------------------------------------------------
// Tela de marcação e registro (banco)
// ---------------------------------------------------------------------------

/** Identificador do empregador que entra no hash do comprovante. */
const EMPLOYER_ID = "RLP ENGENHARIA";
/** Marcação offline pode chegar até 7 dias depois; o horário é o do aparelho. */
const MAX_OFFLINE_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** Tolerância para relógio do aparelho adiantado. */
const MAX_FUTURE_MS = 5 * 60 * 1000;

async function toPunchRow(ctx: QueryCtx, punch: Doc<"clockPunches">) {
  const photoUrl = punch.photoStorageId ? await ctx.storage.getUrl(punch.photoStorageId) : null;
  return {
    _id: punch._id,
    date: punch.date,
    punchedAt: punch.punchedAt,
    timeLabel: punch.timeLabel,
    sequence: punch.sequence,
    kind: punch.kind as PunchKind,
    geofenceStatus: punch.geofenceStatus,
    worksiteName: punch.projectName ?? null,
    latitude: punch.latitude ?? null,
    longitude: punch.longitude ?? null,
    photoUrl,
    offline: punch.offline,
    nsr: punch.nsr,
    hash: punch.hash,
  };
}

function receiptFor(punch: Doc<"clockPunches">, duplicate: boolean) {
  return {
    punchId: punch._id,
    personName: punch.personName,
    date: punch.date,
    punchedAt: punch.punchedAt,
    timeLabel: punch.timeLabel,
    sequence: punch.sequence,
    kind: punch.kind as PunchKind,
    geofenceStatus: punch.geofenceStatus,
    worksiteName: punch.projectName ?? null,
    nsr: punch.nsr,
    hash: punch.hash,
    duplicate,
  };
}

function assertCoordinate(value: number, label: string, limit: number): void {
  if (!Number.isFinite(value) || Math.abs(value) > limit) {
    throw new ConvexError(`${label} inválida`);
  }
}

/**
 * Tudo que a tela de marcação precisa: se o usuário bate ponto, regras, cercas
 * das obras e as marcações do dia.
 */
export async function getPunchContext(ctx: QueryCtx, user: Doc<"users">, date: string) {
  assertDateKey(date);
  const allowed = hasPermission(user, "ponto.registrar");
  const settings = await getSettings(ctx);
  const rules = {
    photoRequired: settings.photoRequired,
    locationRequired: settings.locationRequired,
    duplicateWindowMinutes: settings.duplicateWindowMinutes,
  };
  if (!allowed) {
    return { allowed, personName: user.name, rules, worksites: [], punches: [] };
  }
  const worksites = (await listGeofencedProjects(ctx)).map((project) => ({
    projectId: project._id,
    name: project.name,
    latitude: project.latitude,
    longitude: project.longitude,
    radiusMeters: project.radiusMeters,
  }));
  const punches = await listUserDayPunches(ctx, user._id, date);
  const rows = [];
  for (const punch of punches) rows.push(await toPunchRow(ctx, punch));
  return { allowed, personName: user.name, rules, worksites, punches: rows };
}

/** Histórico das marcações do usuário no período. */
export async function listMyPunches(
  ctx: QueryCtx,
  user: Doc<"users">,
  input: { from: string; to: string }
) {
  assertDateKey(input.from, "Data inicial");
  assertDateKey(input.to, "Data final");
  if (input.from > input.to) throw new ConvexError("Período inválido");
  const userId = user._id;
  const punches = await ctx.db
    .query("clockPunches")
    .withIndex("by_user_and_date", (q) =>
      q.eq("userId", userId).gte("date", input.from).lte("date", input.to)
    )
    .order("desc")
    .take(2000);
  const rows = [];
  for (const punch of punches.sort((a, b) => b.punchedAt - a.punchedAt)) {
    rows.push(await toPunchRow(ctx, punch));
  }
  return rows;
}

export type RegisterPunchInput = {
  clientPunchId: string;
  /** Relógio do aparelho no toque em "Registrar ponto". */
  capturedAt: number;
  latitude?: number;
  longitude?: number;
  accuracyMeters?: number;
  photoStorageId?: Id<"_storage">;
  /** Quando a foto foi tirada (expira em 5 min). */
  photoCapturedAt?: number;
  /** Marcação feita sem internet e enviada depois. */
  offline?: boolean;
  deviceModel?: string;
  appVersion?: string;
};

/**
 * Registra uma marcação. Idempotente por `clientPunchId`: reenvios da fila
 * offline devolvem o comprovante já emitido.
 */
export async function registerPunch(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: RegisterPunchInput
) {
  const clientPunchId = input.clientPunchId.trim();
  if (!clientPunchId || clientPunchId.length > 100) {
    throw new ConvexError("Identificador da marcação inválido");
  }

  const existing = await getPunchByClientId(ctx, clientPunchId);
  if (existing) {
    if (existing.userId !== user._id) {
      throw new ConvexError("Identificador da marcação já utilizado");
    }
    return receiptFor(existing, true);
  }

  const settings = await getSettings(ctx);
  const now = Date.now();
  const offline = input.offline ?? false;

  // Horário oficial: o do servidor; offline, vale o do aparelho (com limites).
  if (!Number.isFinite(input.capturedAt)) {
    throw new ConvexError("Horário da marcação inválido");
  }
  if (input.capturedAt > now + MAX_FUTURE_MS) {
    throw new ConvexError("Relógio do aparelho está adiantado. Ajuste a hora e tente novamente.");
  }
  if (offline && now - input.capturedAt > MAX_OFFLINE_AGE_MS) {
    throw new ConvexError("Marcação offline antiga demais (mais de 7 dias). Fale com o RH.");
  }
  if (!offline && Math.abs(now - input.capturedAt) > MAX_CLOCK_SKEW_MS) {
    throw new ConvexError("Relógio do aparelho fora de sincronia. Ajuste a hora e tente novamente.");
  }
  const punchedAt = offline ? Math.min(input.capturedAt, now) : now;

  // Localização
  const hasPosition = input.latitude !== undefined && input.longitude !== undefined;
  if (hasPosition) {
    assertCoordinate(input.latitude!, "Latitude", 90);
    assertCoordinate(input.longitude!, "Longitude", 180);
  }
  if (settings.locationRequired && !hasPosition) {
    throw new ConvexError(
      "Não foi possível obter sua localização. Permita o acesso à localização e tente novamente."
    );
  }

  // Foto
  if (settings.photoRequired && !input.photoStorageId) {
    throw new ConvexError("Tire uma foto para registrar o ponto.");
  }
  if (input.photoStorageId) {
    const file = await ctx.db.system.get("_storage", input.photoStorageId);
    if (!file) throw new ConvexError("Foto não encontrada. Tire uma nova foto.");
    // Tipo informado no upload e diferente de JPEG/PNG/WebP (ex.: SVG) é
    // recusado. Sem tipo, a rota de entrega confere o arquivo e não o serve.
    if (file.contentType && !isPunchPhotoType(file.contentType)) {
      throw new ConvexError("Formato de foto não suportado. Tire uma nova foto.");
    }
    // A idade da foto conta do instante mais antigo conhecido: o upload
    // (autoritativo, do servidor) ou a captura informada pelo aparelho.
    const photoTakenAt = Math.min(file._creationTime, input.photoCapturedAt ?? Infinity);
    if (!offline && now - photoTakenAt > PHOTO_MAX_AGE_MS) {
      throw new ConvexError("Foto expirada, tire uma nova foto para registrar o ponto.");
    }
  }

  const date = toBrtDateKey(punchedAt);
  const dayPunches = await listUserDayPunches(ctx, user._id, date);

  // Toque repetido
  const latest = dayPunches.reduce<number | null>(
    (max, punch) => (max === null || punch.punchedAt > max ? punch.punchedAt : max),
    null
  );
  if (!offline && isDuplicatePunch(latest, punchedAt, settings.duplicateWindowMinutes)) {
    throw new ConvexError(
      `Marcação repetida: aguarde ${settings.duplicateWindowMinutes} minuto(s) para registrar novamente.`
    );
  }

  // Posição no dia (marcação offline pode ser anterior às já gravadas)
  const earlier = dayPunches.filter((punch) => punch.punchedAt <= punchedAt).length;
  const { sequence, kind } = nextSequence(earlier);

  // Cerca
  const projects = await listGeofencedProjects(ctx);
  const match = classifyGeofence(
    hasPosition ? { latitude: input.latitude!, longitude: input.longitude! } : null,
    projects
  );

  // Comprovante
  const nsr = await nextNsr(ctx);
  const hash = buildPunchHash({
    nsr,
    employerId: EMPLOYER_ID,
    personId: user._id,
    punchedAt,
  });

  const punchId = await ctx.db.insert("clockPunches", {
    userId: user._id,
    personName: user.name,
    clientPunchId,
    date,
    punchedAt,
    timeLabel: toBrtTimeLabel(punchedAt),
    sequence,
    kind,
    latitude: hasPosition ? input.latitude : undefined,
    longitude: hasPosition ? input.longitude : undefined,
    accuracyMeters: input.accuracyMeters,
    photoStorageId: input.photoStorageId,
    projectId: match.worksite?._id,
    projectName: match.worksite?.name,
    geofenceStatus: match.status,
    capturedAt: input.capturedAt,
    offline,
    deviceModel: input.deviceModel?.slice(0, 80),
    appVersion: input.appVersion?.slice(0, 40),
    nsr,
    hash,
  });

  // Marcação offline inserida "no meio" do dia: renumera as posteriores.
  if (earlier < dayPunches.length) {
    let next = sequence + 1;
    for (const punch of dayPunches.filter((item) => item.punchedAt > punchedAt)) {
      const renumbered = nextSequence(next);
      if (punch.sequence !== renumbered.sequence || punch.kind !== renumbered.kind) {
        await ctx.db.patch("clockPunches", punch._id, renumbered);
      }
      next += 1;
    }
  }

  await recomputeDaySummary(ctx, user._id, date);

  const inserted = await ctx.db.get("clockPunches", punchId);
  if (!inserted) throw new ConvexError("Falha ao gravar a marcação");
  return receiptFor(inserted, false);
}

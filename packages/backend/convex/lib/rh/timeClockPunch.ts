/**
 * Marcação de ponto pelo app RLP (clone do fluxo REP-P do RHID).
 *
 * Módulo puro: checagem de cerca (geofence), número sequencial/hash do
 * comprovante e regras de duplicidade. O registro em si fica em
 * `convex/timeClockPunch.ts`.
 */

import { punchKindForSequence, type PunchKind } from "./rhid";

export type GeofenceStatus = "not_controlled" | "inside" | "outside";

export const GEOFENCE_STATUS_LABEL: Record<GeofenceStatus, string> = {
  not_controlled: "Não controla",
  inside: "Dentro da cerca",
  outside: "Fora da cerca",
};

/** Raio padrão de uma cerca nova (mesmo do editor do RHID). */
export const DEFAULT_GEOFENCE_RADIUS_METERS = 200;
/** Janela padrão para ignorar toques repetidos ("Batida repetida (min)"). */
export const DEFAULT_DUPLICATE_WINDOW_MINUTES = 1;
/** Foto capturada há mais tempo que isto não vale mais (regra do RHID web). */
export const PHOTO_MAX_AGE_MS = 5 * 60 * 1000;
/** Tolerância entre o relógio do aparelho e o do servidor. */
export const MAX_CLOCK_SKEW_MS = 24 * 60 * 60 * 1000;

export type GeofenceLike = {
  latitude: number;
  longitude: number;
  radius: number;
};

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
    const inside = distance <= Math.max(0, geofence.radius);
    if (
      !best ||
      (inside && !best.inside) ||
      (inside === best.inside &&
        (distance < best.distance ||
          (distance === best.distance && geofence.radius < best.worksite.radius)))
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

/** Marcação dentro da janela de repetição do mesmo funcionário é ignorada. */
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
  employeeId: string;
  cpf?: string | null;
  punchedAt: number;
};

/** Texto canônico que entra no hash (uma linha, campos separados por "|"). */
export function punchHashPayload(input: PunchHashInput): string {
  return [
    String(input.nsr),
    input.employerId,
    input.employeeId,
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

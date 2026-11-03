/**
 * The short-lived JWT the company backend accepts (the device token is the long credential;
 * see session.ts). Kept in memory only, renewed a few minutes before it expires, and never
 * renewed twice at once: concurrent callers share the same refresh.
 */

export interface Jwt {
  token: string;
  /** ms epoch */
  expiresAt: number;
}

/** Renew this long before expiry, so a call never leaves with a token about to lapse. */
export const REFRESH_MARGIN_MS = 5 * 60_000;

export const needsRefresh = (jwt: Jwt | null, now: number, margin = REFRESH_MARGIN_MS): boolean =>
  !jwt || jwt.expiresAt - margin <= now;

export interface JwtCache {
  /** A valid JWT: the cached one, or a fresh one when it is missing, about to expire or forced. */
  get(force?: boolean): Promise<string>;
  set(jwt: Jwt): void;
  /** Forget the JWT (sign-out); a refresh still in flight is discarded. */
  clear(): void;
}

export function createJwtCache(refresh: () => Promise<Jwt>, now = () => Date.now()): JwtCache {
  let current: Jwt | null = null;
  let inflight: Promise<Jwt> | null = null;
  let generation = 0;
  return {
    async get(force = false) {
      if (!force && current && !needsRefresh(current, now())) return current.token;
      if (!inflight) {
        const started = generation;
        inflight = refresh()
          .then((jwt) => {
            if (started === generation) current = jwt;
            return jwt;
          })
          .finally(() => {
            if (started === generation) inflight = null;
          });
      }
      return (await inflight).token;
    },
    set(jwt) {
      current = jwt;
    },
    clear() {
      generation++;
      current = null;
      inflight = null;
    },
  };
}

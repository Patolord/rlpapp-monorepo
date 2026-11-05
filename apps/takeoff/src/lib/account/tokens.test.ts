import { describe, expect, it, vi } from "vitest";
import { createJwtCache, type Jwt, needsRefresh, REFRESH_MARGIN_MS } from "./tokens";

const HOUR = 3_600_000;

describe("needsRefresh", () => {
  it("refreshes when missing or within the margin of expiry", () => {
    const now = 1_000_000;
    expect(needsRefresh(null, now)).toBe(true);
    expect(needsRefresh({ token: "a", expiresAt: now + HOUR }, now)).toBe(false);
    expect(needsRefresh({ token: "a", expiresAt: now + REFRESH_MARGIN_MS }, now)).toBe(true);
    expect(needsRefresh({ token: "a", expiresAt: now - 1 }, now)).toBe(true);
  });
});

describe("createJwtCache", () => {
  const setup = () => {
    let now = 0;
    let n = 0;
    const refresh = vi.fn(
      async (): Promise<Jwt> => ({ token: `jwt-${++n}`, expiresAt: now + HOUR }),
    );
    const cache = createJwtCache(refresh, () => now);
    return { cache, refresh, advance: (ms: number) => (now += ms) };
  };

  it("fetches once and reuses the JWT until it is about to expire", async () => {
    const { cache, refresh, advance } = setup();
    expect(await cache.get()).toBe("jwt-1");
    advance(HOUR - REFRESH_MARGIN_MS - 1);
    expect(await cache.get()).toBe("jwt-1");
    expect(refresh).toHaveBeenCalledTimes(1);
    advance(2);
    expect(await cache.get()).toBe("jwt-2");
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("shares one refresh between concurrent callers", async () => {
    const { cache, refresh } = setup();
    const tokens = await Promise.all([cache.get(), cache.get(), cache.get()]);
    expect(tokens).toEqual(["jwt-1", "jwt-1", "jwt-1"]);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("force renews even a fresh JWT; set seeds it without a call", async () => {
    const { cache, refresh } = setup();
    cache.set({ token: "seed", expiresAt: HOUR });
    expect(await cache.get()).toBe("seed");
    expect(refresh).not.toHaveBeenCalled();
    expect(await cache.get(true)).toBe("jwt-1");
  });

  it("a failed refresh is not cached: the next call tries again", async () => {
    const refresh = vi
      .fn<() => Promise<Jwt>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({ token: "ok", expiresAt: Date.now() + HOUR });
    const cache = createJwtCache(refresh);
    await expect(cache.get()).rejects.toThrow("offline");
    expect(await cache.get()).toBe("ok");
  });

  it("clear drops the JWT and discards a refresh still in flight", async () => {
    let release: (jwt: Jwt) => void = () => {};
    const refresh = vi.fn(
      () =>
        new Promise<Jwt>((resolve) => {
          release = resolve;
        }),
    );
    const cache = createJwtCache(refresh, () => 0);
    const pending = cache.get();
    cache.clear();
    release({ token: "late", expiresAt: HOUR });
    expect(await pending).toBe("late");
    // the late answer was not kept: the next call refreshes again
    const next = cache.get();
    release({ token: "new", expiresAt: HOUR });
    expect(await next).toBe("new");
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});

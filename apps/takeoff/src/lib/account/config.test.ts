import { describe, expect, it } from "vitest";
import { CONVEX_SITE_URL, CONVEX_URL, siteUrlFromCloud, WEB_URL } from "./config";

describe("company account addresses", () => {
  it("defaults to production", () => {
    expect(CONVEX_URL).toBe("https://rosy-crow-250.convex.cloud");
    expect(CONVEX_SITE_URL).toBe("https://rosy-crow-250.convex.site");
    expect(WEB_URL).toBe("https://app.rlpeng.com.br");
  });

  it("maps the client host to the HTTP host, local backend included", () => {
    expect(siteUrlFromCloud("https://x.convex.cloud")).toBe("https://x.convex.site");
    expect(siteUrlFromCloud("http://127.0.0.1:3210")).toBe("http://127.0.0.1:3211");
  });
});

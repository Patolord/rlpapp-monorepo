import { describe, expect, it } from "vitest";
import { CONVEX_SITE_URL, CONVEX_URL, cloudUrlFromSite, siteUrlFromCloud, WEB_URL } from "./config";

describe("company account addresses", () => {
  it("defaults to production, on the catalog's deployment", () => {
    expect(CONVEX_URL).toBe("https://rosy-crow-250.convex.cloud");
    expect(CONVEX_SITE_URL).toBe("https://rosy-crow-250.convex.site");
    expect(WEB_URL).toBe("https://app.rlpeng.com.br");
  });

  it("maps between the client and HTTP hosts, local backend included", () => {
    expect(cloudUrlFromSite("https://x.convex.site/takeoff/catalog")).toBe(
      "https://x.convex.cloud",
    );
    expect(siteUrlFromCloud("https://x.convex.cloud")).toBe("https://x.convex.site");
    expect(siteUrlFromCloud("http://127.0.0.1:3210")).toBe("http://127.0.0.1:3211");
    expect(cloudUrlFromSite("http://127.0.0.1:3211")).toBe("http://127.0.0.1:3210");
  });
});

import { describe, expect, it } from "vitest";
import { isAllowedPhotoUrl, readPhotoBody } from "./attendancePhoto";

describe("attendance photo proxy", () => {
  it("restricts upstream photo URLs to explicit HTTPS hosts", () => {
    expect(isAllowedPhotoUrl("https://www.rhid.com.br/photo/1.jpg")).toBe(true);
    expect(isAllowedPhotoUrl("https://media.example.com/1.jpg", "media.example.com")).toBe(true);
    for (const url of ["http://rhid.com.br/1.jpg", "https://rhid.com.br.evil.test/1.jpg", "https://127.0.0.1/a", "https://rhid.com.br:8443/a", "https://user:password@rhid.com.br/a", "file:///a", "garbage"]) {
      expect(isAllowedPhotoUrl(url)).toBe(false);
    }
  });
  it("bounds the streamed body even without content-length", async () => {
    const response = new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(5 * 1024 * 1024 + 1)); controller.close(); } }));
    await expect(readPhotoBody(response)).rejects.toThrow("Photo too large");
  });
  it("preserves valid image bytes", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    expect(await readPhotoBody(new Response(bytes))).toEqual(bytes);
  });
});

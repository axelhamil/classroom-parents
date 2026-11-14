import { headersFor, resolveRequest } from "@packages/web-kit/hosting/static-hosting";
import { describe, expect, it } from "vitest";
import hosting from "../../vercel.json";

const BUILT = new Set(["/index.html", "/404.html", "/_astro/site.abc.css"]);
const isFile = (path: string) => BUILT.has(path);

describe("site hosting", () => {
  it("answers an unknown page with the built 404 page and its status", () => {
    expect(resolveRequest(hosting, "/nowhere", isFile)).toEqual({ file: "/404.html", status: 404 });
  });

  it("caches the hashed bundle for a year and revalidates the pages", () => {
    expect(headersFor(hosting, "/_astro/site.abc.css")["Cache-Control"]).toContain("immutable");
    expect(headersFor(hosting, "/")["Cache-Control"]).toBe("no-cache");
  });

  it("forbids framing, which the page CSP meta cannot express", () => {
    expect(headersFor(hosting, "/")["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
  });
});

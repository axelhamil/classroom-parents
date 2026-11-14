import { headersFor, resolveRequest } from "@packages/web-kit/hosting/static-hosting";
import { describe, expect, it } from "vitest";
import { appHosting } from "../app-hosting";

const ENV = { VITE_API_URL: "https://api.example.com/" };
const BUILT = new Set(["/index.html", "/sw.js", "/assets/index-abc.js"]);
const isFile = (path: string) => BUILT.has(path);

function served(path: string, env: Record<string, string | undefined> = ENV) {
  const hosting = appHosting(env);
  return { ...resolveRequest(hosting, path, isFile), headers: headersFor(hosting, path) };
}

describe("app hosting", () => {
  it("serves the app shell on a deep route, revalidated on every visit", () => {
    const response = served("/events/42/edit");

    expect(response).toMatchObject({ file: "/index.html", status: 200 });
    expect(response.headers["Cache-Control"]).toBe("no-cache");
  });

  it("answers 404 for a missing asset instead of the app shell", () => {
    expect(served("/assets/missing.js")).toMatchObject({ file: null, status: 404 });
  });

  it("caches a hashed asset for a year and never the service worker", () => {
    expect(served("/assets/index-abc.js").headers["Cache-Control"]).toContain("immutable");
    expect(served("/sw.js")).toMatchObject({ file: "/sw.js", status: 200 });
    expect(served("/sw.js").headers["Cache-Control"]).toBe("no-cache");
  });

  it("lets scripts come from the app origin only and fetches reach the api origin", () => {
    const csp = served("/").headers["Content-Security-Policy"];

    expect(csp).toContain("script-src 'self';");
    expect(csp).not.toMatch(/script-src[^;]*unsafe/);
    expect(csp).toContain("connect-src 'self' https://api.example.com;");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("allows the error tracker ingest origin only when a DSN is set", () => {
    const csp = served("/", {
      ...ENV,
      VITE_SENTRY_DSN: "https://key@o1.ingest.de.sentry.io/7",
    }).headers["Content-Security-Policy"];

    expect(csp).toContain(
      "connect-src 'self' https://api.example.com https://o1.ingest.de.sentry.io;",
    );
  });

  it("refuses to build the policy without the api origin", () => {
    expect(() => appHosting({})).toThrow(/VITE_API_URL/);
    expect(() => appHosting({ VITE_API_URL: " " })).toThrow(/VITE_API_URL/);
  });
});

import type { StaticHostingConfig } from "@packages/web-kit/hosting/static-hosting";

type BuildEnv = Record<string, string | undefined>;

const NOT_ASSETS = "/((?!assets/).*)";
const IMMUTABLE = "public, max-age=31536000, immutable";

function originOf(env: BuildEnv, name: string): string | undefined {
  const value = env[name]?.trim();
  if (!value) return undefined;

  return new URL(value).origin;
}

export function contentSecurityPolicy(env: BuildEnv): string {
  const api = originOf(env, "VITE_API_URL");
  if (!api) {
    throw new Error(
      "VITE_API_URL is required: the Content-Security-Policy allows the app to reach the api origin only",
    );
  }

  const sentry = originOf(env, "VITE_SENTRY_DSN");
  const connect = ["'self'", api, sentry].filter(Boolean).join(" ");

  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://lh3.googleusercontent.com",
    "font-src 'self' data:",
    `connect-src ${connect}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}

export function appHosting(env: BuildEnv): StaticHostingConfig {
  return {
    rewrites: [{ source: NOT_ASSETS, destination: "/index.html" }],
    headers: [
      {
        source: "/(.*)",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Content-Security-Policy", value: contentSecurityPolicy(env) },
        ],
      },
      { source: NOT_ASSETS, headers: [{ key: "Cache-Control", value: "no-cache" }] },
      { source: "/assets/(.*)", headers: [{ key: "Cache-Control", value: IMMUTABLE }] },
    ],
  };
}

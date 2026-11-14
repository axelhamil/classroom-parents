import { readFileSync, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, join, resolve, sep } from "node:path";

interface HostingHeader {
  key: string;
  value: string;
}

interface HeaderRule {
  source: string;
  headers: HostingHeader[];
}

interface Rewrite {
  source: string;
  destination: string;
}

export interface StaticHostingConfig {
  cleanUrls?: boolean;
  headers: HeaderRule[];
  rewrites?: Rewrite[];
}

type Resolution = { file: string; status: 200 | 404 } | { file: null; status: 404 };

interface PreviewServer {
  config: { root: string; build: { outDir: string } };
  middlewares: { use(handler: (req: IncomingMessage, res: ServerResponse) => void): void };
}

const CONTENT_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".xml": "application/xml; charset=utf-8",
};

function matches(source: string, pathname: string): boolean {
  return new RegExp(`^${source}$`).test(pathname);
}

export function headersFor(config: StaticHostingConfig, pathname: string): Record<string, string> {
  const headers: Record<string, string> = {};

  for (const rule of config.headers) {
    if (!matches(rule.source, pathname)) continue;
    for (const { key, value } of rule.headers) headers[key] = value;
  }

  return headers;
}

function candidates(config: StaticHostingConfig, pathname: string): string[] {
  if (pathname.endsWith("/")) return [`${pathname}index.html`];

  const clean = config.cleanUrls ? [`${pathname}.html`] : [];
  return [pathname, ...clean, `${pathname}/index.html`];
}

export function resolveRequest(
  config: StaticHostingConfig,
  pathname: string,
  isFile: (path: string) => boolean,
): Resolution {
  const direct = candidates(config, pathname).find(isFile);
  if (direct) return { file: direct, status: 200 };

  const rewrite = config.rewrites?.find(({ source }) => matches(source, pathname));
  if (rewrite && isFile(rewrite.destination)) return { file: rewrite.destination, status: 200 };

  return isFile("/404.html") ? { file: "/404.html", status: 404 } : { file: null, status: 404 };
}

function serve(
  config: StaticHostingConfig,
  root: string,
  req: IncomingMessage,
  res: ServerResponse,
) {
  const pathname = decodeURIComponent(new URL(req.url ?? "/", "http://preview").pathname);
  const absolute = (path: string) => join(root, path);
  const isFile = (path: string) =>
    absolute(path).startsWith(root + sep) &&
    statSync(absolute(path), { throwIfNoEntry: false })?.isFile() === true;

  const { file, status } = resolveRequest(config, pathname, isFile);

  res.statusCode = status;
  for (const [key, value] of Object.entries(headersFor(config, pathname)))
    res.setHeader(key, value);

  if (!file) {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end(req.method === "HEAD" ? undefined : "Not Found");
    return;
  }

  res.setHeader("Content-Type", CONTENT_TYPES[extname(file)] ?? "application/octet-stream");
  res.end(req.method === "HEAD" ? undefined : readFileSync(absolute(file)));
}

export function staticHostingPreview(config: StaticHostingConfig) {
  return {
    name: "static-hosting-preview",
    configurePreviewServer(server: PreviewServer) {
      const root = resolve(server.config.root, server.config.build.outDir);
      server.middlewares.use((req, res) => serve(config, root, req, res));
    },
  };
}

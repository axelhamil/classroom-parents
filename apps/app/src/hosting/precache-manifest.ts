import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import type { Plugin } from "vite";

const PRECACHE_FILE = "sw-precache.js";

const WORKER_FILES = new Set(["sw.js", PRECACHE_FILE]);

const INSTALL_ONLY_DIR = "screenshots/";

interface PrecacheManifest {
  version: string;
  urls: string[];
}

interface BuiltFile {
  path: string;
  content: Buffer;
}

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
}

function isPrecached(path: string): boolean {
  return !path.endsWith(".map") && !WORKER_FILES.has(path) && !path.startsWith(INSTALL_ONLY_DIR);
}

export function precacheManifestOf(files: readonly BuiltFile[]): PrecacheManifest {
  const kept = files
    .filter(({ path }) => isPrecached(path))
    .sort((a, b) => a.path.localeCompare(b.path));
  const hash = createHash("sha256");

  for (const { path, content } of kept) hash.update(path).update(content);

  return {
    version: hash.digest("hex").slice(0, 16),
    urls: kept.map(({ path }) => `/${path}`),
  };
}

function readBuiltFiles(outDir: string): BuiltFile[] {
  return listFiles(outDir).map((file) => ({
    path: relative(outDir, file).split(sep).join("/"),
    content: readFileSync(file),
  }));
}

/**
 * Writes `sw-precache.js` next to the build: the list of every file the service worker
 * caches for offline use, and a version hashed from their content. The worker imports it,
 * so a deploy that changes any byte changes this file, and the browser installs the new
 * worker on its next update check. A plain script file, so `script-src 'self'` holds.
 */
export function precacheManifest(): Plugin {
  let outDir = "";

  return {
    name: "keepupkids:precache-manifest",
    apply: "build",
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const manifest = precacheManifestOf(readBuiltFiles(outDir));
      writeFileSync(join(outDir, PRECACHE_FILE), `self.PRECACHE = ${JSON.stringify(manifest)};\n`);
    },
  };
}

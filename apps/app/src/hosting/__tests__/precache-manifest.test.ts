import { describe, expect, it } from "vitest";
import { precacheManifestOf } from "../precache-manifest";

const built = (path: string, content = path) => ({ path, content: Buffer.from(content) });

const BUILD = [
  built("index.html"),
  built("assets/index-abc.js"),
  built("assets/index-abc.js.map"),
  built("icons/icon-192.png"),
  built("sw.js"),
  built("sw-precache.js"),
];

describe("precache manifest", () => {
  it("given a build, then it lists every served file but the source maps and the worker itself", () => {
    expect(precacheManifestOf(BUILD).urls).toEqual([
      "/assets/index-abc.js",
      "/icons/icon-192.png",
      "/index.html",
    ]);
  });

  it("given a file whose bytes change between two builds, then the version changes, so the browser installs the new worker", () => {
    const next = BUILD.map((file) =>
      file.path === "index.html" ? built("index.html", "new shell") : file,
    );

    expect(precacheManifestOf(next).version).not.toBe(precacheManifestOf(BUILD).version);
  });

  it("given the same build twice, then the version is stable, so a redeploy without change installs nothing", () => {
    expect(precacheManifestOf([...BUILD].reverse()).version).toBe(
      precacheManifestOf(BUILD).version,
    );
  });
});

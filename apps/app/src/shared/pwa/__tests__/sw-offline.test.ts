import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

const WORKER = readFileSync(
  fileURLToPath(new URL("../../../../public/sw.js", import.meta.url)),
  "utf8",
);
const ORIGIN = "https://app.example.test";
const SHELL_HTML = "<!doctype html><title>cached shell</title>";

interface Manifest {
  version: string;
  urls: string[];
}

interface WorkerEvent {
  request?: Request;
  data?: unknown;
  preloadResponse?: Promise<Response | undefined>;
  waitUntil: (work: Promise<unknown>) => void;
  respondWith: (response: Promise<Response>) => void;
}

class WorkerRequest extends Request {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    super(typeof input === "string" ? new URL(input, ORIGIN) : input, init);
  }
}

class FakeCaches {
  readonly stores = new Map<string, Map<string, Response>>();

  async open(name: string) {
    const store = this.stores.get(name) ?? new Map<string, Response>();
    this.stores.set(name, store);

    return {
      addAll: async (requests: Request[]) => {
        for (const request of requests)
          store.set(
            new URL(request.url, ORIGIN).pathname,
            new Response(`body of ${request.url}`, { headers: { Vary: "Origin" } }),
          );
      },
    };
  }

  async match(
    request: Request | string,
    { cacheName, ignoreVary = false }: { cacheName: string; ignoreVary?: boolean },
  ) {
    const path = new URL(typeof request === "string" ? request : request.url, ORIGIN).pathname;
    const cached = this.stores.get(cacheName)?.get(path);
    const variesWithTheRequest = cached?.headers.has("Vary") && !ignoreVary;

    return variesWithTheRequest ? undefined : cached?.clone();
  }

  async keys() {
    return [...this.stores.keys()];
  }

  async delete(name: string) {
    return this.stores.delete(name);
  }
}

function startWorker(manifest: Manifest | null, network: (request: Request) => Promise<Response>) {
  const handlers = new Map<string, (event: WorkerEvent) => void>();
  const caches = new FakeCaches();
  const fetch = vi.fn(network);
  const scope = {
    location: { origin: ORIGIN },
    caches,
    fetch,
    clients: { claim: async () => undefined },
    skipWaiting: vi.fn(async () => undefined),
    registration: {
      navigationPreload: {
        enable: vi.fn(async () => undefined),
        disable: vi.fn(async () => undefined),
      },
    },
    importScripts: () => {
      if (!manifest) throw new Error("no precache in dev");
      Object.assign(scope, { PRECACHE: manifest });
    },
    addEventListener: (type: string, handler: (event: WorkerEvent) => void) =>
      handlers.set(type, handler),
  };
  new Function("self", "Request", WORKER)(scope, WorkerRequest);

  const lifecycle = async (type: "install" | "activate") => {
    const work: Promise<unknown>[] = [];
    handlers.get(type)?.({ waitUntil: (job) => work.push(job), respondWith: () => undefined });
    await Promise.all(work);
  };

  const message = (data: unknown) =>
    handlers.get("message")?.({ data, waitUntil: () => undefined, respondWith: () => undefined });

  const request = (
    path: string,
    mode: RequestMode = "cors",
    preloadResponse: Promise<Response | undefined> = Promise.resolve(undefined),
  ) => {
    let answer: Promise<Response> | undefined;
    const target = new Request(new URL(path, ORIGIN));
    Object.defineProperty(target, "mode", { value: mode });
    handlers.get("fetch")?.({
      request: target,
      preloadResponse,
      waitUntil: () => undefined,
      respondWith: (response) => {
        answer = response;
      },
    });

    return answer;
  };

  return { caches, fetch, lifecycle, message, request, scope };
}

const MANIFEST: Manifest = { version: "v2", urls: ["/index.html", "/assets/index-abc.js"] };
const offline = () => Promise.reject(new TypeError("Failed to fetch"));

describe("service worker, offline shell", () => {
  it("given a build manifest, when it installs, then every built file is cached under its version", async () => {
    const worker = startWorker(MANIFEST, offline);

    await worker.lifecycle("install");

    expect([...(worker.caches.stores.get("keepupkids-shell-v2")?.keys() ?? [])]).toEqual(
      MANIFEST.urls,
    );
  });

  it("given the network answers, when the app is opened, then the fresh html is served, never the cached one", async () => {
    const worker = startWorker(MANIFEST, async () => new Response("fresh html"));
    await worker.lifecycle("install");

    const page = await worker.request("/events/e1", "navigate");

    expect(await page?.text()).toBe("fresh html");
  });

  it("given the network fails, when the app is opened on any path, then the cached shell is served", async () => {
    const worker = startWorker(MANIFEST, offline);
    await worker.lifecycle("install");
    worker.caches.stores.get("keepupkids-shell-v2")?.set("/index.html", new Response(SHELL_HTML));

    const page = await worker.request("/?view=week", "navigate");

    expect(await page?.text()).toBe(SHELL_HTML);
  });

  it("given a built asset served with a Vary header, when the page asks for it offline, then it still comes from the cache", async () => {
    const worker = startWorker(MANIFEST, offline);
    await worker.lifecycle("install");

    const script = await worker.request("/assets/index-abc.js");

    expect(await script?.text()).toContain("/assets/index-abc.js");
  });

  it("given a new version activates, then the shells of older deploys are dropped", async () => {
    const worker = startWorker(MANIFEST, offline);
    await worker.caches.open("keepupkids-shell-v1");
    await worker.caches.open("unrelated-cache");
    await worker.lifecycle("install");

    await worker.lifecycle("activate");

    expect(await worker.caches.keys()).toEqual(["unrelated-cache", "keepupkids-shell-v2"]);
  });

  it("given no build manifest (dev), then no request is intercepted", async () => {
    const worker = startWorker(null, offline);
    await worker.lifecycle("install");

    expect(worker.request("/", "navigate")).toBeUndefined();
    expect(worker.request("/assets/index-abc.js")).toBeUndefined();
  });

  it("given a request to the api origin, then it is left to the network", async () => {
    const worker = startWorker(MANIFEST, offline);
    await worker.lifecycle("install");

    expect(worker.request("https://api.example.test/events")).toBeUndefined();
  });

  it("given an open app on the previous version, when the new one installs, then it waits for the parent to accept the reload", async () => {
    const worker = startWorker(MANIFEST, offline);

    await worker.lifecycle("install");

    expect(worker.scope.skipWaiting).not.toHaveBeenCalled();

    worker.message({ type: "keepupkids:skip-waiting" });

    expect(worker.scope.skipWaiting).toHaveBeenCalledOnce();
  });

  it("given the worker answers navigations, when it activates, then the html request starts while it boots", async () => {
    const worker = startWorker(MANIFEST, offline);

    await worker.lifecycle("activate");

    expect(worker.scope.registration.navigationPreload.enable).toHaveBeenCalledOnce();
  });

  it("given a preloaded page, when the app is opened, then it is served without a second request", async () => {
    const worker = startWorker(MANIFEST, offline);
    await worker.lifecycle("install");

    const page = await worker.request(
      "/",
      "navigate",
      Promise.resolve(new Response("preloaded html")),
    );

    expect(await page?.text()).toBe("preloaded html");
    expect(worker.fetch).not.toHaveBeenCalled();
  });
});

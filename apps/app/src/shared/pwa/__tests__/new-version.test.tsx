// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders, resetApp } from "../../../__tests__/app-harness";

function fakeWorker(state: ServiceWorkerState) {
  return Object.assign(new EventTarget(), { state, postMessage: vi.fn() });
}

type FakeWorker = ReturnType<typeof fakeWorker>;

function fakeRegistration(waiting: FakeWorker | null, installing: FakeWorker | null = null) {
  return Object.assign(new EventTarget(), { waiting, installing });
}

const RUNNING_VERSION = { controller: {} };
const NOTHING_RUNNING = { controller: null };

async function freshModule() {
  vi.resetModules();

  return import("../new-version");
}

describe("new version of the app", () => {
  beforeEach(() => {
    vi.stubGlobal("navigator", { ...navigator, serviceWorker: new EventTarget() });
  });

  afterEach(() => {
    cleanup();
    resetApp();
  });

  it("given a new version installed behind the running one, then the parent is offered a reload, and accepting it hands over to the new worker", async () => {
    const { NewVersionToast, watchForNewVersion } = await freshModule();
    const next = fakeWorker("installed");
    watchForNewVersion(fakeRegistration(next), RUNNING_VERSION);

    await renderWithProviders(<NewVersionToast />);
    expect(await screen.findByText("Nouvelle version prête")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Recharger" }));

    await vi.waitFor(() =>
      expect(next.postMessage).toHaveBeenCalledWith({ type: "keepupkids:skip-waiting" }),
    );
  });

  it("given the first install on this device, then nothing is offered, the worker simply starts", async () => {
    const { NewVersionToast, watchForNewVersion } = await freshModule();
    const first = fakeWorker("installing");
    const registration = fakeRegistration(null, first);
    watchForNewVersion(registration, NOTHING_RUNNING);

    registration.dispatchEvent(new Event("updatefound"));
    first.state = "installed";
    first.dispatchEvent(new Event("statechange"));
    await renderWithProviders(<NewVersionToast />);

    expect(screen.queryByText("Nouvelle version prête")).toBeNull();
  });
});

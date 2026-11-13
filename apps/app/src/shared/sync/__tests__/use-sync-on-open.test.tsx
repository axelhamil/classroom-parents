// @vitest-environment jsdom
import { act, cleanup, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type ApiCall,
  json,
  queryClient,
  renderWithProviders,
  resetApp,
  stubApi,
} from "../../../__tests__/app-harness";
import { requestSyncMutationOptions } from "../../api/mutations/request-sync";
import { useSyncOnOpen } from "../use-sync-on-open";

const OPENED_AT = new Date("2030-01-15T07:00:00.000Z");

function SyncOnOpen() {
  useSyncOnOpen();

  return null;
}

function syncRequests(calls: ApiCall[]): ApiCall[] {
  return calls.filter((call) => call.method === "POST" && call.url.pathname === "/sync");
}

function givenSyncAnswers(status: number, outcome = "started"): ApiCall[] {
  const retryAt = new Date(OPENED_AT.getTime() + 5 * 60_000).toISOString();
  return stubApi(({ url }) =>
    url.pathname === "/sync" ? json({ status: outcome, retryAt }, status) : undefined,
  );
}

async function openAndFail(): Promise<ApiCall[]> {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(OPENED_AT);
  const calls = givenSyncAnswers(503);
  await renderWithProviders(<SyncOnOpen />);
  await waitFor(() =>
    expect(
      queryClient
        .getMutationCache()
        .findAll({ mutationKey: requestSyncMutationOptions.mutationKey, status: "error" }),
    ).toHaveLength(1),
  );

  return calls;
}

function comeBackAfter(ms: number, event: "visibilitychange" | "online"): void {
  vi.setSystemTime(OPENED_AT.getTime() + ms);
  act(() => {
    if (event === "online") window.dispatchEvent(new Event("online"));
    else document.dispatchEvent(new Event("visibilitychange"));
  });
}

describe("useSyncOnOpen", () => {
  afterEach(() => {
    cleanup();
    resetApp();
    vi.useRealTimers();
  });

  it("given the shell mounts twice in one app open, then Classroom is read once", async () => {
    const calls = givenSyncAnswers(202);

    const first = await renderWithProviders(<SyncOnOpen />);
    await waitFor(() => expect(syncRequests(calls)).toHaveLength(1));
    first.unmount();
    await renderWithProviders(<SyncOnOpen />);
    document.dispatchEvent(new Event("visibilitychange"));

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(syncRequests(calls)).toHaveLength(1);
  });

  it("given the server is still cooling down, when the app comes back, then it records no error and does not ask again", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(OPENED_AT);
    const calls = givenSyncAnswers(202, "throttled");
    await renderWithProviders(<SyncOnOpen />);
    await waitFor(() => expect(syncRequests(calls)).toHaveLength(1));

    comeBackAfter(60_000, "visibilitychange");

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(syncRequests(calls)).toHaveLength(1);
    expect(
      queryClient
        .getMutationCache()
        .findAll({ mutationKey: requestSyncMutationOptions.mutationKey, status: "error" }),
    ).toHaveLength(0);
  });

  it("given a failed sync, when the app becomes visible again, then it asks once more", async () => {
    const calls = await openAndFail();

    comeBackAfter(60_000, "visibilitychange");

    await waitFor(() => expect(syncRequests(calls)).toHaveLength(2));
  });

  it("given a failed sync, when the network comes back, then it asks once more", async () => {
    const calls = await openAndFail();

    comeBackAfter(60_000, "online");

    await waitFor(() => expect(syncRequests(calls)).toHaveLength(2));
  });

  it("given a failed sync, when the app comes back within seconds, then it waits before asking again", async () => {
    const calls = await openAndFail();

    comeBackAfter(1_000, "visibilitychange");

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(syncRequests(calls)).toHaveLength(1);
  });
});

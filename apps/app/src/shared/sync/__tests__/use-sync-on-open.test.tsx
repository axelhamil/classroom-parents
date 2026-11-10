// @vitest-environment jsdom
import { cleanup, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { json, renderWithProviders, resetApp, stubApi } from "../../../__tests__/app-harness";
import { useSyncOnOpen } from "../use-sync-on-open";

function SyncOnOpen() {
  useSyncOnOpen();

  return null;
}

describe("useSyncOnOpen", () => {
  afterEach(() => {
    cleanup();
    resetApp();
  });

  it("given the shell mounts twice in one app open, then Classroom is read once", async () => {
    const calls = stubApi(({ url }) =>
      url.pathname === "/sync" ? json({ status: "requested" }, 202) : undefined,
    );
    const syncRequests = () =>
      calls.filter((call) => call.method === "POST" && call.url.pathname === "/sync");

    const first = await renderWithProviders(<SyncOnOpen />);
    await waitFor(() => expect(syncRequests()).toHaveLength(1));
    first.unmount();
    await renderWithProviders(<SyncOnOpen />);

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(syncRequests()).toHaveLength(1);
  });
});

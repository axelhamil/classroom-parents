// @vitest-environment jsdom
import { cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { byRoute, json, renderAppAt, resetApp, stubApi } from "../../../__tests__/app-harness";
import { CHILD } from "../../../__tests__/family-fixtures";

function givenUnread(count: number) {
  return stubApi(
    byRoute({
      "GET /children": () => json([CHILD]),
      "GET /events": () => json({ items: [], nextCursor: null }),
      "GET /notifications/unread-count": () => json({ count }),
      "POST /notifications/read-by-ref": () => new Response(null, { status: 204 }),
    }),
  );
}

describe("notification bell", () => {
  afterEach(() => {
    cleanup();
    resetApp();
  });

  it.each([
    [0, "Notifications", null],
    [1, "Notifications, 1 non lue", "1"],
    [3, "Notifications, 3 non lues", "3"],
    [12, "Notifications, 12 non lues", "9+"],
  ])("given %i unread, then the bell is named %s and shows %s", async (count, name, shown) => {
    givenUnread(count);

    await renderAppAt("/children");

    const bell = await screen.findByRole("button", { name });
    const mark = bell.querySelector("[data-slot=unread-count]");
    expect(mark?.textContent ?? null).toBe(shown);
  });

  it("given a push opened with its reference, then it is marked read and the reference leaves the URL", async () => {
    const calls = givenUnread(1);

    const router = await renderAppAt("/children?notification=reminders%3Abatch-1");

    await waitFor(() => expect(router.state.location.href).toBe("/children"));
    const reads = calls.filter((call) => call.url.pathname === "/notifications/read-by-ref");
    expect(reads.map((call) => call.body)).toEqual([{ ref: "reminders:batch-1" }]);
  });
});

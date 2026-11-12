// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { json, renderAppAt, resetApp, stubApi } from "../../../__tests__/app-harness";
import { EVENT_BASE } from "../../../__tests__/event-fixtures";

vi.mock("@packages/web-kit/theme/use-theme", () => ({
  useTheme: () => ({ theme: "system", resolvedTheme: "light", setTheme: () => undefined }),
}));

const EVENT = {
  ...EVENT_BASE,
  title: "Contrôle de maths",
  description: "",
  category: "assessment",
  deadlineDate: "2026-11-19",
  deadlineAt: "2026-11-19T22:59:00.000Z",
};
const DETAIL_PATH = `/events/${EVENT.id}`;

function givenEvent(event: unknown, reminders: () => Response) {
  return stubApi(({ method, url }) => {
    if (method !== "GET") return undefined;
    if (url.pathname === "/children") return json([]);
    if (url.pathname === DETAIL_PATH) return json(event);
    if (url.pathname === `${DETAIL_PATH}/reminders`) return reminders();
    return undefined;
  });
}

describe("event detail reminders", () => {
  afterEach(() => {
    cleanup();
    resetApp();
  });

  it("given homework already turned in, then no reminder section is offered", async () => {
    const calls = givenEvent({ ...EVENT, done: true }, () =>
      json({ customized: false, reminders: [] }),
    );

    await renderAppAt(DETAIL_PATH);

    await screen.findByRole("heading", { level: 1, name: EVENT.title });
    expect(screen.queryByRole("heading", { name: "Rappels" })).toBeNull();
    expect(calls.some(({ url }) => url.pathname.endsWith("/reminders"))).toBe(false);
  });

  it("given an announcement hidden by the coursework of its day, then no reminder section nor load error is shown", async () => {
    givenEvent(EVENT, () => json({ error: { code: "ALERT_NOT_FOUND" } }, 404));

    await renderAppAt(DETAIL_PATH);

    await screen.findByRole("heading", { level: 1, name: EVENT.title });
    await vi.waitFor(() => expect(screen.queryByRole("heading", { name: "Rappels" })).toBeNull(), {
      timeout: 3000,
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("given an event the parent added by hand, then no Classroom link is offered", async () => {
    const { announcementUrl: _url, ...manual } = EVENT;
    givenEvent({ ...manual, source: "manual" }, () => json({ customized: false, reminders: [] }));

    await renderAppAt(DETAIL_PATH);

    await screen.findByRole("heading", { level: 1, name: EVENT.title });
    expect(screen.queryByText("Ouvrir dans Classroom")).toBeNull();
  });
});

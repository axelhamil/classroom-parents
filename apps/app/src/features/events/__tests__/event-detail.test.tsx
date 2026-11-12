// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { json, renderAppAt, resetApp, stubApi } from "../../../__tests__/app-harness";
import { EVENT_BASE } from "../../../__tests__/event-fixtures";

vi.mock("@packages/web-kit/theme/use-theme", () => ({
  useTheme: () => ({
    theme: "system",
    resolvedTheme: "light",
    changeTheme: () => Promise.resolve(),
  }),
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

interface ServerChecklist {
  done: string[];
  removed: string[];
  extra: { id: string; label: string }[];
}

interface ChecklistChangeBody {
  kind: string;
  itemId?: string;
  done?: boolean;
  checklist?: ServerChecklist;
}

function serverChecklist(event: typeof EVENT, failing = false): Parameters<typeof stubApi>[0] {
  let checklist: ServerChecklist = { done: [], removed: [], extra: [] };

  return ({ method, url, body }) => {
    if (url.pathname === "/children") return json([]);
    if (url.pathname === `${DETAIL_PATH}/reminders`)
      return json({ customized: false, reminders: [] });
    if (url.pathname === DETAIL_PATH && method === "GET") return json({ ...event, checklist });
    if (url.pathname !== `${DETAIL_PATH}/checklist` || method !== "POST") return undefined;
    if (failing) return json({ code: "INTERNAL" }, 500);

    const change = body as ChecklistChangeBody;
    if (change.kind === "tick" && change.itemId)
      checklist = {
        ...checklist,
        done: change.done
          ? [...checklist.done, change.itemId]
          : checklist.done.filter((id) => id !== change.itemId),
      };
    if (change.kind === "import" && change.checklist) checklist = change.checklist;
    return json({ ...event, checklist });
  };
}

const SWIMMING = { ...EVENT, title: "Piscine", category: "swimming" };
const LOCAL_KEY = `user:user-1:checklist:${EVENT.id}`;

describe("event detail, preparation checklist shared across devices", () => {
  afterEach(() => {
    cleanup();
    resetApp();
    localStorage.clear();
  });

  it("given Piscine, when the parent ticks an item, then the server keeps it and another device sees it ticked", async () => {
    const server = serverChecklist(SWIMMING);
    const calls = stubApi(server);
    await renderAppAt(DETAIL_PATH);

    await screen.findByRole("heading", { level: 2, name: "À préparer" });
    for (const item of ["Maillot de bain", "Bonnet de bain", "Serviette", "Gel douche"])
      expect(screen.getByRole("checkbox", { name: item })).toBeDefined();
    fireEvent.click(screen.getByRole("checkbox", { name: "Bonnet de bain" }));

    await waitFor(() =>
      expect(calls.filter(({ url }) => url.pathname.endsWith("/checklist"))).toHaveLength(1),
    );
    expect(calls.find(({ url }) => url.pathname.endsWith("/checklist"))?.body).toEqual({
      kind: "tick",
      itemId: "prepare.items.swimming.cap",
      done: true,
    });

    cleanup();
    resetApp();
    localStorage.clear();
    stubApi(server);
    await renderAppAt(DETAIL_PATH);

    const kept = await screen.findByRole("checkbox", { name: "Bonnet de bain" });
    await waitFor(() => expect(kept.getAttribute("aria-checked")).toBe("true"));
    expect(
      screen.getByRole("checkbox", { name: "Maillot de bain" }).getAttribute("aria-checked"),
    ).toBe("false");
  });

  it("given a checklist this device kept before, then it is sent once to the server and cleared from the device", async () => {
    localStorage.setItem(
      LOCAL_KEY,
      JSON.stringify({ done: ["prepare.items.homework.check"], removed: [], extra: [] }),
    );
    const calls = stubApi(serverChecklist({ ...EVENT, category: "homework" }));
    await renderAppAt(DETAIL_PATH);

    const item = await screen.findByRole("checkbox", { name: "Vérifier qu'il est fait" });
    await waitFor(() => expect(item.getAttribute("aria-checked")).toBe("true"));
    expect(calls.filter(({ url }) => url.pathname.endsWith("/checklist"))).toEqual([
      expect.objectContaining({
        body: {
          kind: "import",
          checklist: { done: ["prepare.items.homework.check"], removed: [], extra: [] },
        },
      }),
    ]);
    await waitFor(() => expect(localStorage.getItem(LOCAL_KEY)).toBeNull());
  });

  it("given the server refuses a tick, then the item goes back to unticked", async () => {
    stubApi(serverChecklist(SWIMMING, true));
    await renderAppAt(DETAIL_PATH);

    const cap = await screen.findByRole("checkbox", { name: "Bonnet de bain" });
    fireEvent.click(cap);

    await waitFor(() =>
      expect(
        screen.getByRole("checkbox", { name: "Bonnet de bain" }).getAttribute("aria-checked"),
      ).toBe("false"),
    );
    expect(
      await screen.findByText("Échec de l'enregistrement de la liste à préparer"),
    ).toBeDefined();
  });
});

describe("event detail, family helpers", () => {
  afterEach(() => {
    cleanup();
    resetApp();
    localStorage.clear();
  });

  it("share falls back to clipboard", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    givenEvent(EVENT, () => json({ customized: false, reminders: [] }));
    await renderAppAt(DETAIL_PATH);

    fireEvent.click(await screen.findByRole("button", { name: "Partager" }));

    expect(await screen.findByText("Copié, prêt à coller dans un message")).toBeDefined();
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining(EVENT.title));
  });

  it("the shared text names the deadline, its date and a link", async () => {
    const share = vi.fn(async (_payload: ShareData) => undefined);
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    givenEvent(EVENT, () => json({ customized: false, reminders: [] }));
    await renderAppAt(DETAIL_PATH);

    fireEvent.click(await screen.findByRole("button", { name: "Partager" }));

    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    const payload = share.mock.calls[0]?.[0];
    expect(payload?.text).toContain(EVENT.title);
    expect(payload?.text).toContain("Pour jeudi 19 novembre");
    expect(payload?.url).toBe(`${window.location.origin}${DETAIL_PATH}`);
    Reflect.deleteProperty(navigator, "share");
  });

  it("an event without a Classroom link offers no Classroom button", async () => {
    givenEvent({ ...EVENT, announcementUrl: "" }, () => json({ customized: false, reminders: [] }));
    await renderAppAt(DETAIL_PATH);

    await screen.findByRole("heading", { level: 1, name: EVENT.title });
    expect(screen.queryByRole("link", { name: "Ouvrir dans Classroom" })).toBeNull();
  });
});

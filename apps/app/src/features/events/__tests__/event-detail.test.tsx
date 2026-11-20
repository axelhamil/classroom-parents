// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { json, renderAppAt, resetApp, stubApi } from "../../../__tests__/app-harness";
import { EVENT_BASE } from "../../../__tests__/event-fixtures";
import { CHILD } from "../../../__tests__/family-fixtures";
import { at } from "../../../__tests__/week-fixtures";
import { askedStepsOf } from "../../../shared/agenda/checklist-template";
import type { EventItem } from "../../../shared/api/queries/events";

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

describe("event detail review", () => {
  afterEach(() => {
    cleanup();
    resetApp();
  });

  const TO_REVIEW = {
    ...EVENT,
    status: "needs_review",
    amendReason: "moved",
    reviewReasons: ["weekday_mismatch"],
    evidence: {
      before: "Bonjour, <b>attention</b> : ",
      quote: "Contrôle <img src=x onerror=alert(1)> jeudi [ici](http://evil.test)",
      after: ". Apportez une calculatrice.",
    },
  };

  it("given a deadline to verify, then the drawer says why in sentences and quotes the announcement as plain text", async () => {
    givenEvent(TO_REVIEW, () => json({ customized: false, reminders: [] }));

    await renderAppAt(DETAIL_PATH);

    const why = await screen.findByRole("region", { name: "Pourquoi à vérifier" });
    expect(why.textContent).toContain("Une annonce plus récente déplace cette échéance");
    expect(why.textContent).toContain("Le jour de la semaine écrit ne tombe pas à cette date.");
    const passage = why.querySelector("mark");
    expect(passage?.textContent).toBe(TO_REVIEW.evidence.quote);
    expect(passage?.parentElement?.textContent).toBe(
      `${TO_REVIEW.evidence.before}${TO_REVIEW.evidence.quote}${TO_REVIEW.evidence.after}`,
    );
    expect(why.querySelector("img")).toBeNull();
    expect(why.querySelector("a")).toBeNull();
    expect(why.querySelector("b")).toBeNull();
  });

  it("given a deadline to verify with no stored reason, then the drawer still says what to check", async () => {
    givenEvent({ ...EVENT, status: "needs_review" }, () =>
      json({ customized: false, reminders: [] }),
    );

    await renderAppAt(DETAIL_PATH);

    const why = await screen.findByRole("region", { name: "Pourquoi à vérifier" });
    expect(why.textContent).toContain("Une information de l'annonce n'a pas pu être vérifiée.");
  });

  it("given a deadline to verify, when the parent says it is right, then it is confirmed", async () => {
    const calls = stubApi(({ method, url }) => {
      if (method === "POST" && url.pathname === `${DETAIL_PATH}/confirm`)
        return json({ ...TO_REVIEW, status: "confirmed" });
      if (url.pathname === "/children") return json([]);
      if (url.pathname === DETAIL_PATH) return json(TO_REVIEW);
      if (url.pathname === `${DETAIL_PATH}/reminders`)
        return json({ customized: false, reminders: [] });
      return undefined;
    });

    await renderAppAt(DETAIL_PATH);
    fireEvent.click(await screen.findByRole("button", { name: "C'est bon" }));

    await waitFor(() =>
      expect(
        calls.some(({ method, url }) => method === "POST" && url.pathname.endsWith("/confirm")),
      ).toBe(true),
    );
  });

  it("given a confirmed deadline, then no review section is shown", async () => {
    givenEvent(EVENT, () => json({ customized: false, reminders: [] }));

    await renderAppAt(DETAIL_PATH);

    await screen.findByRole("heading", { level: 1, name: EVENT.title });
    expect(screen.queryByRole("region", { name: "Pourquoi à vérifier" })).toBeNull();
  });
});

describe("event detail agenda export", () => {
  afterEach(() => {
    cleanup();
    resetApp();
    vi.unstubAllGlobals();
  });

  it("given a child and a planned reminder, then the downloaded file names the child and rings with the reminder", async () => {
    const files: Blob[] = [];
    vi.stubGlobal(
      "URL",
      Object.assign(class extends URL {}, {
        createObjectURL: (blob: Blob) => {
          files.push(blob);
          return "blob:agenda";
        },
        revokeObjectURL: () => undefined,
      }),
    );
    stubApi(({ method, url }) => {
      if (method !== "GET") return undefined;
      if (url.pathname === "/children") return json([CHILD]);
      if (url.pathname === DETAIL_PATH) return json(EVENT);
      if (url.pathname === `${DETAIL_PATH}/reminders`)
        return json({
          customized: false,
          reminders: [
            {
              reminder: { kind: "days_before", days: 1, time: "18:00" },
              dueAt: "2026-11-18T17:00:00.000Z",
              status: "pending",
              fits: true,
            },
            {
              reminder: { kind: "days_before", days: 2, time: "18:00" },
              dueAt: "2026-11-17T17:00:00.000Z",
              status: "skipped",
              fits: true,
            },
          ],
        });
      return undefined;
    });

    await renderAppAt(DETAIL_PATH);
    await screen.findByRole("heading", { name: "Rappels" });
    await screen.findAllByText(/18:00|18 h/);
    fireEvent.click(screen.getByRole("button", { name: "Ajouter à mon agenda" }));

    await waitFor(() => expect(files).toHaveLength(1));
    const ics = (await files[0]?.text()) ?? "";
    expect(ics).toContain(`SUMMARY:${CHILD.label} : ${EVENT.title}\r\n`);
    expect(ics.match(/BEGIN:VALARM/g)).toHaveLength(1);
    expect(ics).toContain("TRIGGER;VALUE=DATE-TIME:20261118T170000Z\r\n");
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

describe("event detail, what the announcement asks", () => {
  afterEach(() => {
    cleanup();
    resetApp();
    vi.useRealTimers();
    localStorage.clear();
  });

  const OUTING_ASKS: NonNullable<EventItem["preparation"]> = {
    parentActions: [
      {
        kind: "pay",
        label: "Payer la sortie",
        amountCents: 1250,
        currency: "EUR",
        quote: "Merci de régler 12,50 € avant vendredi.",
      },
    ],
    toBring: [{ item: "Gourde", quote: "Chaque enfant apporte une gourde." }],
  };

  const OUTING = {
    ...EVENT,
    title: "Sortie au musée",
    category: "school_trip",
    preparation: OUTING_ASKS,
  };
  const PAY = /^Payer la sortie : 12,50\s€$/;

  it("given an outing asking to pay and to bring, then the drawer lists them with the amount and the quotes, the template apart and uncounted", async () => {
    at("2026-11-12T17:00:00.000Z");
    stubApi(serverChecklist(OUTING));
    await renderAppAt(DETAIL_PATH);

    const section = await screen.findByRole("region", { name: "À préparer" });
    expect(within(section).getByRole("checkbox", { name: PAY })).toBeDefined();
    expect(within(section).getByRole("checkbox", { name: "Gourde" })).toBeDefined();
    expect(within(section).getByText("0 sur 2")).toBeDefined();
    expect(within(section).getByText("Lu dans l'annonce")).toBeDefined();
    expect(within(section).getByText("Merci de régler 12,50 € avant vendredi.")).toBeDefined();
    expect(within(section).getByText("Chaque enfant apporte une gourde.")).toBeDefined();
    const ideas = within(section).getByRole("list", { name: "Suggestions" });
    expect(within(ideas).getAllByRole("checkbox")).toHaveLength(3);
    expect(within(section).queryByRole("button", { name: "Retirer « Gourde »" })).toBeNull();
  });

  it("given an outing asking to pay, when the parent ticks the payment, then the server keeps that step", async () => {
    at("2026-11-12T17:00:00.000Z");
    const calls = stubApi(serverChecklist(OUTING));
    await renderAppAt(DETAIL_PATH);

    fireEvent.click(await screen.findByRole("checkbox", { name: PAY }));

    await waitFor(() =>
      expect(calls.find(({ url }) => url.pathname.endsWith("/checklist"))?.body).toEqual({
        kind: "tick",
        itemId: askedStepsOf({ preparation: OUTING_ASKS })[0]?.id,
        done: true,
      }),
    );
    await waitFor(() => expect(screen.getByText("1 sur 2")).toBeDefined());
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
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-16T09:00:00.000Z") });
    onTestFinished(() => {
      vi.useRealTimers();
    });
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

  it("says in one sentence whose deadline it is and where it came from", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-06T09:00:00.000Z") });
    onTestFinished(() => {
      vi.useRealTimers();
    });
    stubApi(({ method, url }) => {
      if (method !== "GET") return undefined;
      if (url.pathname === "/children") return json([CHILD]);
      if (url.pathname === DETAIL_PATH) return json(EVENT);
      if (url.pathname === `${DETAIL_PATH}/reminders`)
        return json({ customized: false, reminders: [] });
      return undefined;
    });
    await renderAppAt(DETAIL_PATH);

    expect(await screen.findByText("Léa, annonce Classroom reçue hier")).toBeDefined();
  });

  it("names the course between the child and the origin when Classroom gave one", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-06T09:00:00.000Z") });
    onTestFinished(() => {
      vi.useRealTimers();
    });
    stubApi(({ method, url }) => {
      if (method !== "GET") return undefined;
      if (url.pathname === "/children") return json([CHILD]);
      if (url.pathname === DETAIL_PATH)
        return json({ ...EVENT, course: { id: "course-1", name: "Mathématiques" } });
      if (url.pathname === `${DETAIL_PATH}/reminders`)
        return json({ customized: false, reminders: [] });
      return undefined;
    });
    await renderAppAt(DETAIL_PATH);

    expect(
      await screen.findByText("Léa, Mathématiques, annonce Classroom reçue hier"),
    ).toBeDefined();
  });

  it("an event without a Classroom link offers no Classroom button", async () => {
    givenEvent({ ...EVENT, announcementUrl: "" }, () => json({ customized: false, reminders: [] }));
    await renderAppAt(DETAIL_PATH);

    await screen.findByRole("heading", { level: 1, name: EVENT.title });
    expect(screen.queryByRole("link", { name: "Ouvrir dans Classroom" })).toBeNull();
  });
});

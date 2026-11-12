import { type ApiCall, json, stubApi } from "./app-harness";
import { CHILD } from "./family-fixtures";
import { deadline, HUGO } from "./week-fixtures";

type Fixture = ReturnType<typeof deadline>;

export interface CalendarStub {
  calls: ApiCall[];
  events: Fixture[];
}

export interface CalendarStubOptions {
  failDone?: Promise<Response>;
  refuseFirstDone?: boolean;
  detail?: Fixture;
}

function created(body: unknown, index: number): Fixture | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const fields = Object.fromEntries(Object.entries(body));
  const { title, deadlineDate } = fields;
  if (typeof title !== "string" || typeof deadlineDate !== "string") return undefined;

  return deadline(900 + index, deadlineDate, title, { ...fields, source: "manual" });
}

export function givenCalendar(
  children: unknown[],
  events: Fixture[],
  { failDone, detail, refuseFirstDone = false }: CalendarStubOptions = {},
): CalendarStub {
  const stub: CalendarStub = { calls: [], events: [...events] };
  let refusals = refuseFirstDone ? 1 : 0;

  stub.calls = stubApi(({ method, url, body }) => {
    if (url.pathname === "/children") return json(children);
    if (url.pathname === "/sync") return json({ status: "requested" }, 202);
    if (url.pathname === "/calendar-feed" && method === "GET") return json({ exists: false });
    if (url.pathname === "/events" && method === "GET") {
      if (url.searchParams.get("status") !== "confirmed") return json({ items: [] });
      const today = new Date().toISOString().slice(0, 10);
      const next = stub.events
        .filter((event) => event.deadlineDate >= today)
        .sort((left, right) => left.deadlineDate.localeCompare(right.deadlineDate));

      return json({ items: next.slice(0, Number(url.searchParams.get("limit") ?? next.length)) });
    }
    if (url.pathname === "/events/calendar") {
      const from = url.searchParams.get("from") ?? "";
      const to = url.searchParams.get("to") ?? "";

      return json({
        items: stub.events.filter(
          (event) => event.deadlineDate >= from && event.deadlineDate <= to,
        ),
      });
    }
    if (url.pathname === "/events" && method === "POST") {
      const event = created(body, stub.events.length);
      if (!event) return json({ code: "EVENT_TITLE_INVALID" }, 400);
      stub.events.push(event);

      return json(event, 201);
    }
    if (detail && url.pathname === `/events/${detail.id}`) return json(detail);
    if (detail && url.pathname === `/events/${detail.id}/reminders`)
      return json({ customized: false, reminders: [] });
    const done = url.pathname.match(/^\/events\/([^/]+)\/done$/);
    if (done) {
      if (failDone) return failDone;
      if (refusals > 0) {
        refusals -= 1;
        return new Promise<Response>((resolve) =>
          setTimeout(() => resolve(json({ code: "INTERNAL" }, 500)), 50),
        );
      }
      const event = stub.events.find((candidate) => candidate.id === done[1]);
      if (!event) return json({ code: "EVENT_NOT_FOUND" }, 404);
      Object.assign(event, { done: method === "POST" });

      return json(event);
    }

    return undefined;
  });

  return stub;
}

export function calendarRequests(calls: readonly ApiCall[]): { from: string; to: string }[] {
  return calls
    .filter((call) => call.method === "GET" && call.url.pathname === "/events/calendar")
    .map((call) => ({
      from: call.url.searchParams.get("from") ?? "",
      to: call.url.searchParams.get("to") ?? "",
    }));
}

const TITLE_120 =
  "Exposé sur le cycle de l'eau avec maquette, affiche A3, trois sources citées et une démonstration devant toute la classe";

const KIDS = ["Léa", "Hugo", "Inès", "Tom", "Maximilien-Alexandre"];

export const FIVE_CHILDREN = KIDS.map((label, index) => ({
  ...CHILD,
  id: `5c1d2e3f-4a5b-4c6d-8e9f-${String(index).padStart(12, "0")}`,
  label,
  color: index + 1,
}));

export function crunchDay(date: string, count: number): Fixture[] {
  return Array.from({ length: count }, (_, index) =>
    deadline(100 + index, date, index === 0 ? TITLE_120 : `Devoir ${index + 1}`, {
      childId: FIVE_CHILDREN[index % FIVE_CHILDREN.length]?.id,
      deadlineTime: `${String(8 + (index % 10)).padStart(2, "0")}:00`,
    }),
  );
}

export const STRESS = {
  title120: TITLE_120,
  fiveChildren: FIVE_CHILDREN,
  pastDue: (date: string) => deadline(300, date, "Cahier de liaison à signer"),
  hugo: HUGO,
};

import { vi } from "vitest";
import { type ApiCall, json, stubApi } from "./app-harness";
import { EVENT_BASE } from "./event-fixtures";
import { CHILD } from "./family-fixtures";

export const HUGO = {
  ...CHILD,
  id: "2b9e4c1a-7d3f-4b6e-9a8c-1f0e2d3c4b5a",
  label: "Hugo",
  color: 2,
};

export function deadline(index: number, date: string, title: string, extra: object = {}) {
  return {
    ...EVENT_BASE,
    id: `7c1d2e3f-4a5b-4c6d-8e9f-${String(index).padStart(12, "0")}`,
    title,
    description: "",
    category: "homework",
    deadlineDate: date,
    deadlineAt: `${date}T22:59:00.000Z`,
    ...extra,
  };
}

export function givenFamily(children: unknown[], events: unknown[]): ApiCall[] {
  return stubApi(({ method, url }) => {
    if (url.pathname === "/children") return json(children);
    if (url.pathname === "/events" && method === "GET") {
      if (url.searchParams.get("status") === "needs_review") return json({ items: [] });
      return json({ items: events });
    }
    if (url.pathname === "/sync") return json({ status: "requested" }, 202);
    return undefined;
  });
}

export function at(instant: string): void {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(instant));
}

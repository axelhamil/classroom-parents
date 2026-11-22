import type { AuditedPage } from "@packages/test/a11y";
import { stubChildrenApi } from "./children-fixture";

export const PUBLIC_PAGES: readonly AuditedPage[] = [
  { name: "login", path: "/login" },
  { name: "data rights", path: "/legal/data-rights" },
  { name: "accessibility statement", path: "/legal/accessibility" },
  { name: "privacy policy", path: "/legal/privacy-policy" },
  { name: "terms", path: "/legal/terms" },
  { name: "cookies policy", path: "/legal/cookies" },
  { name: "sub-processors", path: "/legal/sub-processors" },
  { name: "not found", path: "/no-such-page" },
];

/**
 * `/` is a pure redirect: auditing it audits whichever page it lands on, so the
 * signed-in destination is listed directly instead.
 */
export const AUTHENTICATED_PAGES: readonly AuditedPage[] = [
  { name: "events", path: "/", prepare: stubChildrenApi },
  { name: "fridge planner", path: "/week/print", prepare: stubChildrenApi },
  { name: "settings", path: "/settings" },
  { name: "settings, notifications", path: "/settings/notifications" },
  { name: "settings, language and region", path: "/settings/region" },
  { name: "settings, ai", path: "/settings/ai" },
  { name: "settings, appearance", path: "/settings/appearance" },
  { name: "settings, account", path: "/settings/account" },
  { name: "settings, privacy", path: "/settings/privacy" },
  { name: "settings, help", path: "/settings/help" },
  { name: "history", path: "/?tab=history", prepare: stubChildrenApi },
  { name: "calendar, week", path: "/?view=week", prepare: stubChildrenApi },
  { name: "calendar, month", path: "/?view=month", prepare: stubChildrenApi },
  { name: "school help", path: "/aide/ecole", prepare: stubChildrenApi },
  { name: "children, every state", path: "/children", prepare: stubChildrenApi },
  { name: "onboarding", path: "/onboarding" },
  { name: "add a child", path: "/children/new" },
  { name: "add a deadline", path: "/events/new", prepare: stubChildrenApi },
  { name: "child link refused", path: "/children/link-error", prepare: stubChildrenApi },
  { name: "not found (signed in)", path: "/no-such-page" },
];

/**
 * Pages left out of `page-width.spec.ts`, which fails every other page whose box or painted
 * content leaves more than a quarter of a 1440px or 1920px screen empty, or that caps one of its
 * cards. Each one says why.
 */
export const WIDTH_GATE_EXEMPT: ReadonlyMap<string, string> = new Map([
  ["login", "a lone sign-in form: wider fields only stretch the eye's path"],
  ["fridge planner", "the preview of a printed sheet keeps the paper's proportions"],
  ["settings", "from a tablet up it only redirects to its first section, gated below"],
]);

/**
 * Pages whose content is running text or a lone message: their box takes the screen, but what
 * they paint stops at the reading measure the spec asks for, so only the painted check skips them.
 */
export const RUNNING_TEXT_PAGES: ReadonlyMap<string, string> = new Map([
  ["data rights", "legal prose at the reading measure"],
  ["accessibility statement", "legal prose at the reading measure"],
  ["privacy policy", "legal prose at the reading measure"],
  ["terms", "legal prose at the reading measure"],
  ["cookies policy", "legal prose at the reading measure"],
  ["sub-processors", "legal prose at the reading measure"],
  ["not found", "a lone message under its icon"],
  ["not found (signed in)", "a lone message under its icon"],
]);

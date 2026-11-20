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
 * Pages declared `full` (`pageContainerVariants`): cards or lists that reflow into more columns.
 * `page-width.spec.ts` fails any of them that leaves more than a quarter of a 1440px screen empty.
 * `settings` is left out: from a tablet up it only redirects to its first section, listed below,
 * so measuring it at 1440px raced the redirect.
 */
export const FULL_WIDTH_PAGES: ReadonlySet<string> = new Set([
  "not found",
  "settings, notifications",
  "settings, language and region",
  "settings, ai",
  "settings, appearance",
  "settings, account",
  "settings, privacy",
  "settings, help",
  "children, every state",
  "not found (signed in)",
]);

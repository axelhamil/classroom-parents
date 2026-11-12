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
  { name: "settings", path: "/settings" },
  { name: "history", path: "/?tab=history" },
  { name: "upcoming", path: "/?tab=upcoming" },
  { name: "privacy settings", path: "/settings/privacy" },
  { name: "children, every state", path: "/children", prepare: stubChildrenApi },
  { name: "onboarding", path: "/onboarding" },
  { name: "add a child", path: "/children/new" },
  { name: "child link refused", path: "/children/link-error", prepare: stubChildrenApi },
  { name: "not found (signed in)", path: "/no-such-page" },
];

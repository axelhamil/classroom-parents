import type { AuditedPage } from "@packages/test/a11y";

export const PUBLIC_PAGES: readonly AuditedPage[] = [
  { name: "sign-in", path: "/sign-in" },
  { name: "sign-up", path: "/sign-up" },
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
  { name: "dashboard", path: "/dashboard" },
  { name: "privacy settings", path: "/settings/privacy" },
  { name: "not found (signed in)", path: "/no-such-page" },
];

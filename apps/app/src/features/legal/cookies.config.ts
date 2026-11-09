export interface CookieInfo {
  name: string;
  provider: string;
  purpose: string;
  retention: string;
}

export const COOKIE_INVENTORY: readonly CookieInfo[] = [
  {
    name: "better-auth.session_token",
    provider: "This application (BetterAuth)",
    purpose: "Authenticates the signed-in user session.",
    retention: "7 days (standard) / 30 days (remember me)",
  },
];

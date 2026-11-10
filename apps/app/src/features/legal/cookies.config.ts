export interface CookieInfo {
  name: string;
  provider: string;
  purpose: string;
  retention: string;
}

export const COOKIE_INVENTORY: readonly CookieInfo[] = [
  {
    name: "better-auth.session_token",
    provider: "Cette application",
    purpose: "Garde votre session ouverte.",
    retention: "7 jours, prolongés à chaque visite",
  },
  {
    name: "better-auth.session_data",
    provider: "Cette application",
    purpose: "Évite de revérifier la session à chaque écran.",
    retention: "1 minute",
  },
  {
    name: "locale",
    provider: "Cette application",
    purpose: "Retient la langue d'affichage.",
    retention: "1 an",
  },
];

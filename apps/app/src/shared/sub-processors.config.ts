export type SubProcessorId = "google" | "anthropic" | "resend" | "vercel" | "neon";

export interface SubProcessor {
  /**
   * Stable catalog key for the vendor's purpose and region. The register itself
   * stays English (it restates what the signed DPA says, and the DPA is not
   * translated), but the two fields a user reads on screen are copy, so they
   * live in the catalog like every other rendered string.
   */
  id: SubProcessorId;
  name: string;
  purpose: string;
  region: string;
  category: "infra" | "email" | "auth" | "ai";
  url: string;
  dpaUrl?: string;
}

export const SUB_PROCESSORS: readonly SubProcessor[] = [
  {
    id: "google",
    name: "Google",
    purpose:
      "Sign-in with Google and read-only Google Classroom API (courses, announcements, coursework)",
    region: "US (EU DPF-certified)",
    category: "auth",
    url: "https://policies.google.com/privacy",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    purpose: "Deadline extraction from announcement text (Claude API, no training on inputs)",
    region: "US (standard contractual clauses)",
    category: "ai",
    url: "https://www.anthropic.com/legal/privacy",
  },
  {
    id: "resend",
    name: "Resend",
    purpose: "Transactional email delivery (alerts when no device receives push)",
    region: "US (EU DPF-certified)",
    category: "email",
    url: "https://resend.com",
    dpaUrl: "https://resend.com/legal/dpa",
  },
  {
    id: "vercel",
    name: "Vercel",
    purpose: "Runs the api functions and serves the files of the application and the landing page",
    region:
      "api functions in the EU (Frankfurt); app and landing files from the nearest point of its global network; Vercel Inc. (US), standard contractual clauses",
    category: "infra",
    url: "https://vercel.com/legal/privacy-policy",
    dpaUrl: "https://vercel.com/legal/dpa",
  },
  {
    id: "neon",
    name: "Neon",
    purpose: "PostgreSQL database holding the accounts, children, deadlines and alerts",
    region: "EU (Frankfurt); DPA signed by Databricks, Inc. (US), parent company of Neon, LLC",
    category: "infra",
    url: "https://neon.com/privacy-policy",
    dpaUrl: "https://neon.com/dpa",
  },
];

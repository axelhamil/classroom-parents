export type SubProcessorId = "google" | "anthropic" | "resend" | "railway";

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
    id: "railway",
    name: "Railway",
    purpose: "Hosting of the application, its workers and its database",
    region: "EU region chosen at deployment",
    category: "infra",
    url: "https://railway.com",
  },
];

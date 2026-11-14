import type { SubProcessorId } from "./sub-processors.config";

// The register in `sub-processors.config.ts` stays English (it restates the
// signed DPA), but `purpose` and `region` are the two fields a user actually
// reads, on the privacy settings card and on the public register page. Both
// read the same keys, so the two surfaces can never drift apart. They live in
// `common.legal` rather than under either page's own namespace precisely
// because neither page owns them.
export const SUB_PROCESSOR_KEYS = {
  google: {
    purpose: "legal.subProcessors.google.purpose",
    region: "legal.subProcessors.google.region",
  },
  anthropic: {
    purpose: "legal.subProcessors.anthropic.purpose",
    region: "legal.subProcessors.anthropic.region",
  },
  resend: {
    purpose: "legal.subProcessors.resend.purpose",
    region: "legal.subProcessors.resend.region",
  },
  vercel: {
    purpose: "legal.subProcessors.vercel.purpose",
    region: "legal.subProcessors.vercel.region",
  },
  neon: {
    purpose: "legal.subProcessors.neon.purpose",
    region: "legal.subProcessors.neon.region",
  },
} as const satisfies Record<SubProcessorId, { purpose: string; region: string }>;

export const POLICY_TITLE_KEYS = {
  privacy: "legal.policies.privacyTitle",
  terms: "legal.policies.termsTitle",
} as const;

export type PolicyType = keyof typeof POLICY_TITLE_KEYS;

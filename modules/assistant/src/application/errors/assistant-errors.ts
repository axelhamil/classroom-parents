import type { AppError } from "@packages/ddd-kit";

export type AssistantError = AppError<
  "ASSISTANT_PREFERENCE_INVALID" | "ASSISTANT_PROVIDER_FAILURE"
>;

export type QuotaError = AppError<"AI_BUDGET_EXHAUSTED" | "AI_UNAVAILABLE"> | AssistantError;

export const preferenceInvalid = (field: string): AssistantError => ({
  code: "ASSISTANT_PREFERENCE_INVALID",
  message:
    "Cette langue, ce fuseau ou ce pays n'est pas reconnu. Choisissez une valeur de la liste.",
  metadata: { field },
});

const frenchDay = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

export const quotaExhausted = (feature: string, resumesOn: string): QuotaError => ({
  code: "AI_BUDGET_EXHAUSTED",
  message: `Vous avez utilisé tout ce que cette fonction permet ce mois-ci. Elle revient le ${frenchDay.format(new Date(resumesOn))}.`,
  metadata: { feature, resumesOn },
});

export const aiPaused = (feature: string): QuotaError => ({
  code: "AI_UNAVAILABLE",
  message: "Cette fonction est mise en pause quelques heures. Réessayez plus tard.",
  metadata: { feature },
});

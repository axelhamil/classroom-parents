import type { AppError } from "@packages/ddd-kit";

export type HomeError = AppError<
  "HOME_LAYOUT_INVALID" | "HOME_NOTE_INVALID" | "HOME_PROVIDER_FAILURE"
>;

export const layoutInvalid = (reason: string): HomeError => ({
  code: "HOME_LAYOUT_INVALID",
  message:
    "Cette disposition de l'accueil n'est pas valide : 40 blocs au plus, chacun une seule fois.",
  metadata: { reason },
});

export const noteInvalid = (reason: string): HomeError => ({
  code: "HOME_NOTE_INVALID",
  message: "La note compte au plus 4000 caractères. Raccourcissez-la pour l'enregistrer.",
  metadata: { reason },
});

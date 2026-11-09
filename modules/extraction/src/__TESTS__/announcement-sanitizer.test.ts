import { describe, expect, it } from "bun:test";
import { sanitizeAnnouncement } from "../application/services/announcement-sanitizer";

describe("sanitizeAnnouncement", () => {
  it("replaces contact details and links with tokens", () => {
    const text = [
      "Écrire à prenom.nom@ecole.fr ou appeler le +33 6 12 34 56 78 ou le 01.23.45.67.89.",
      "Visio sur meet.google.com/abc-defg-hij et dossier https://drive.google.com/x?id=1.",
      "Référence du paiement 123456789.",
    ].join("\n");

    expect(sanitizeAnnouncement(text)).toBe(
      [
        "Écrire à [EMAIL] ou appeler le [TELEPHONE] ou le [TELEPHONE].",
        "Visio sur [LIEN] et dossier [LIEN].",
        "Référence du paiement [NUMERO].",
      ].join("\n"),
    );
  });

  it("keeps dates and times readable", () => {
    const text = "Contrôle le 19/11/2026 à 8h30, salle 12.";

    expect(sanitizeAnnouncement(text)).toBe(text);
  });

  it("replaces the child's names whatever the case and accents, but not inside other words", () => {
    const text = "Léa, LEA et lea-marie Martin. Merci à Léandre.";

    expect(sanitizeAnnouncement(text, "Léa-Marie Martin")).toBe(
      "[ENFANT], [ENFANT] et [ENFANT]. Merci à Léandre.",
    );
  });
});

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

  it("replaces the full name whatever the case and the first name written as a proper noun", () => {
    const text = "Léa-Marie Martin, LÉA-MARIE MARTIN, Léa-Marie et lea-marie. Merci à Léandre.";

    expect(sanitizeAnnouncement(text, ["Léa-Marie Martin"])).toBe(
      "[ENFANT], [ENFANT], [ENFANT] et lea-marie. Merci à Léandre.",
    );
  });

  it.each([
    [
      "Maël Le Gall",
      "Le contrôle aura lieu le jeudi 19 novembre, Maël Le Gall apporte le cahier de Maël.",
      "Le contrôle aura lieu le jeudi 19 novembre, [ENFANT] apporte le cahier de [ENFANT].",
    ],
    [
      "Inès De La Fontaine",
      "Rendre la fiche de la sortie. De La Fontaine Inès et Inès De La Fontaine.",
      "Rendre la fiche de la sortie. De La Fontaine [ENFANT] et [ENFANT].",
    ],
    [
      "Avril Dupont",
      "Évaluation le 3 avril. Avril Dupont révise, Avril aussi.",
      "Évaluation le 3 avril. [ENFANT] révise, Avril aussi.",
    ],
    [
      "Mai",
      "Sortie le 12 Mai, Mai apporte son pique-nique.",
      "Sortie le 12 Mai, Mai apporte son pique-nique.",
    ],
    ["Ma fille", "Ma fille rend la fiche à ma collègue.", "[ENFANT] rend la fiche à ma collègue."],
  ])("never erases an article or a date for the child %p", (childName, text, expected) => {
    expect(sanitizeAnnouncement(text, [childName])).toBe(expected);
  });
});

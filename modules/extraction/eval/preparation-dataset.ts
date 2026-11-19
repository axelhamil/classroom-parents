import type { ActionCurrency, ParentActionKind } from "@packages/events/agenda-contract";
import type { ExtractionCategoryValue } from "../src/domain/value-objects/extraction-category.vo";

export interface ExpectedAction {
  kind: ParentActionKind;
  amountCents?: number;
  currency?: ActionCurrency;
}

export interface ExpectedPreparation {
  actions: ExpectedAction[];
  toBring: string[];
}

export interface PreparationCase {
  id: string;
  publishedAt: string;
  text: string;
  expected: { category: ExtractionCategoryValue; deadlineDate: string }[];
  preparation?: ExpectedPreparation;
}

const MONDAY_9_NOVEMBER = "2026-11-09T09:00:00Z";

/**
 * What the parent has to pay, sign, return or bring in the announcements of the Classroom
 * dataset that ask for it, by case id. `toBring` holds a word each item must contain; an
 * action of an unexpected kind is not scored, the gate is on recall and on exact amounts.
 */
export const DATASET_PREPARATION: Record<string, ExpectedPreparation> = {
  "trip-and-authorisation": { actions: [{ kind: "sign" }], toBring: [] },
  "swimming-gear": { actions: [], toBring: ["bonnet", "maillot"] },
  "payment-slip": {
    actions: [{ kind: "pay", amountCents: 1200, currency: "EUR" }],
    toBring: [],
  },
  "swimming-certificate": { actions: [{ kind: "return" }], toBring: [] },
  "theatre-trip": { actions: [], toBring: ["pique-nique"] },
  "lab-coat": { actions: [], toBring: ["blouse"] },
  "library-trip": { actions: [], toBring: ["goûter"] },
  "plant-visit": { actions: [{ kind: "sign" }], toBring: [] },
};

/**
 * Cases added for the preparation fields and the free pre-filter: sums written in several
 * formats and currencies, documents to sign, objects named or only implied, and announcements
 * without any date that the pre-filter keeps away from the model, in the school languages.
 */
export const PREPARATION_CASES: PreparationCase[] = [
  {
    id: "prep-cheque-and-form",
    publishedAt: MONDAY_9_NOVEMBER,
    text: "Sortie au zoo le vendredi 27 novembre. Merci de rendre l'autorisation signée et un chèque de 8,50 € avant le lundi 23 novembre.",
    expected: [
      { category: "school_trip", deadlineDate: "2026-11-27" },
      { category: "document_due", deadlineDate: "2026-11-23" },
    ],
    preparation: {
      actions: [{ kind: "sign" }, { kind: "pay", amountCents: 850, currency: "EUR" }],
      toBring: [],
    },
  },
  {
    id: "prep-euro-before",
    publishedAt: MONDAY_9_NOVEMBER,
    text: "Coopérative scolaire : le règlement de €15 est à rendre pour le jeudi 19 novembre.",
    expected: [{ category: "document_due", deadlineDate: "2026-11-19" }],
    preparation: { actions: [{ kind: "pay", amountCents: 1500, currency: "EUR" }], toBring: [] },
  },
  {
    id: "prep-dirhams",
    publishedAt: MONDAY_9_NOVEMBER,
    text: "Sortie au jardin Majorelle le mercredi 25 novembre, le règlement de 50 dh est à rendre avant le vendredi 20 novembre.",
    expected: [
      { category: "school_trip", deadlineDate: "2026-11-25" },
      { category: "document_due", deadlineDate: "2026-11-20" },
    ],
    preparation: { actions: [{ kind: "pay", amountCents: 5000, currency: "MAD" }], toBring: [] },
  },
  {
    id: "prep-swimming-named-gear",
    publishedAt: MONDAY_9_NOVEMBER,
    text: "Piscine le mardi 17 novembre : prévoir maillot, bonnet, serviette et lunettes.",
    expected: [{ category: "swimming", deadlineDate: "2026-11-17" }],
    preparation: { actions: [], toBring: ["maillot", "bonnet", "serviette", "lunettes"] },
  },
  {
    id: "prep-swimming-gear-unnamed",
    publishedAt: MONDAY_9_NOVEMBER,
    text: "Première séance de piscine le jeudi 19 novembre.",
    expected: [{ category: "swimming", deadlineDate: "2026-11-19" }],
    preparation: { actions: [], toBring: [] },
  },
  {
    id: "prep-booklet-to-sign",
    publishedAt: MONDAY_9_NOVEMBER,
    text: "Le livret du premier trimestre est à signer et à rendre pour le vendredi 4 décembre.",
    expected: [{ category: "document_due", deadlineDate: "2026-12-04" }],
    preparation: { actions: [{ kind: "sign" }], toBring: [] },
  },
  {
    id: "prep-no-date-thanks",
    publishedAt: MONDAY_9_NOVEMBER,
    text: "Merci aux parents pour leur aide lors de la kermesse, les enfants étaient ravis !",
    expected: [],
  },
  {
    id: "prep-no-date-reminder",
    publishedAt: MONDAY_9_NOVEMBER,
    text: "Pensez à bien couvrir les livres et à marquer les affaires au nom de l'élève.",
    expected: [],
  },
  {
    id: "prep-no-date-english",
    publishedAt: MONDAY_9_NOVEMBER,
    text: "Great job everyone on the class project, I am proud of you!",
    expected: [],
  },
  {
    id: "prep-no-date-spanish",
    publishedAt: MONDAY_9_NOVEMBER,
    text: "Gracias a todas las familias por su apoyo durante el festival.",
    expected: [],
  },
  {
    id: "prep-no-date-portuguese",
    publishedAt: MONDAY_9_NOVEMBER,
    text: "Parabéns a todos pela apresentação, foi um sucesso!",
    expected: [],
  },
  {
    id: "prep-no-date-arabic",
    publishedAt: MONDAY_9_NOVEMBER,
    text: "شكرا لجميع الأولياء على مساعدتهم في الحفل المدرسي.",
    expected: [],
  },
];

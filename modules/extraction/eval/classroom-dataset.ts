import type { ExtractionCategoryValue } from "../src/domain/value-objects/extraction-category.vo";

export type DatasetChildKey = "lea" | "hugo";

export interface DatasetChild {
  key: DatasetChildKey;
  firstName: string;
  googleName: string;
  googleEmail: string;
}

export interface DatasetCourse {
  id: string;
  child: DatasetChildKey;
  name: string;
}

export interface DatasetDeadline {
  title: string;
  description: string;
  category: ExtractionCategoryValue;
  deadlineDate: string;
  deadlineTime?: string;
  needsReview?: boolean;
}

export interface DatasetAnnouncement {
  id: string;
  courseId: string;
  publishedAt: string;
  text: string;
  childName?: string;
  expected: DatasetDeadline[];
}

export interface DatasetCoursework {
  id: string;
  courseId: string;
  title: string;
  due?: { utcDate: string; utcTime?: string };
  turnedIn: boolean;
}

export const DATASET_TODAY = "2026-11-23";

export const DATASET_CHILDREN: readonly DatasetChild[] = [
  { key: "lea", firstName: "Léa", googleName: "Léa Martin", googleEmail: "lea.demo@eleve.example" },
  {
    key: "hugo",
    firstName: "Hugo",
    googleName: "Hugo Martin",
    googleEmail: "hugo.demo@eleve.example",
  },
];

export const DATASET_COURSES: readonly DatasetCourse[] = [
  { id: "lea-cm2", child: "lea", name: "CM2 B, Mme Bernard" },
  { id: "lea-anglais", child: "lea", name: "Anglais CM2" },
  { id: "hugo-maths", child: "hugo", name: "Mathématiques 5e C" },
  { id: "hugo-francais", child: "hugo", name: "Français 5e C" },
  { id: "hugo-anglais", child: "hugo", name: "Anglais 5e C" },
  { id: "hugo-sciences", child: "hugo", name: "SVT 5e C" },
];

export const DATASET_ANNOUNCEMENTS: readonly DatasetAnnouncement[] = [
  {
    id: "absolute-date",
    courseId: "hugo-maths",
    publishedAt: "2026-11-09T08:00:00+01:00",
    text: "Évaluation de mathématiques jeudi 19 novembre sur les fractions.",
    expected: [
      {
        title: "Évaluation de mathématiques sur les fractions",
        description: "Réviser le chapitre sur les fractions.",
        category: "assessment",
        deadlineDate: "2026-11-19",
      },
    ],
  },
  {
    id: "next-weekday",
    courseId: "hugo-anglais",
    publishedAt: "2026-11-09T08:00:00+01:00",
    text: "Contrôle d'anglais jeudi prochain, réviser le vocabulaire de l'unité 3.",
    expected: [
      {
        title: "Contrôle d'anglais",
        description: "Réviser le vocabulaire de l'unité 3.",
        category: "assessment",
        deadlineDate: "2026-11-12",
      },
    ],
  },
  {
    id: "tomorrow",
    courseId: "hugo-maths",
    publishedAt: "2026-11-10T17:30:00+01:00",
    text: "Pour demain : terminer les exercices 4 et 5 page 62.",
    expected: [
      {
        title: "Exercices 4 et 5 page 62",
        description: "Terminer les exercices 4 et 5 page 62.",
        category: "homework",
        deadlineDate: "2026-11-11",
      },
    ],
  },
  {
    id: "before-holidays",
    courseId: "lea-cm2",
    publishedAt: "2026-11-30T09:00:00+01:00",
    text: "Merci de rendre la fiche de renseignements avant les vacances.",
    expected: [
      {
        title: "Fiche de renseignements à rendre",
        description: "À rendre avant les vacances de Noël.",
        category: "document_due",
        deadlineDate: "2026-12-18",
        needsReview: true,
      },
    ],
  },
  {
    id: "no-event-praise",
    courseId: "hugo-francais",
    publishedAt: "2026-11-09T12:00:00+01:00",
    text: "Bravo à tous pour le cross du collège, les résultats sont affichés en salle 12.",
    expected: [],
  },
  {
    id: "trip-and-authorisation",
    courseId: "lea-cm2",
    publishedAt: "2026-11-09T08:00:00+01:00",
    text: "Sortie au musée d'histoire naturelle le mardi 1er décembre. L'autorisation signée est à rendre avant le vendredi 20 novembre.",
    expected: [
      {
        title: "Sortie au musée d'histoire naturelle",
        description: "Sortie de la classe au musée.",
        category: "school_trip",
        deadlineDate: "2026-12-01",
      },
      {
        title: "Autorisation de sortie signée",
        description: "Autorisation pour la sortie au musée, à rendre signée.",
        category: "document_due",
        deadlineDate: "2026-11-20",
      },
    ],
  },
  {
    id: "swimming-gear",
    courseId: "lea-cm2",
    publishedAt: "2026-11-16T08:00:00+01:00",
    text: "Piscine jeudi 26 novembre : penser au bonnet et au maillot.",
    expected: [
      {
        title: "Piscine",
        description: "Penser au bonnet et au maillot.",
        category: "swimming",
        deadlineDate: "2026-11-26",
      },
    ],
  },
  {
    id: "homework-with-time",
    courseId: "hugo-sciences",
    publishedAt: "2026-11-11T14:00:00+01:00",
    text: "Exposé sur les volcans à envoyer avant lundi 23 novembre 18h.",
    expected: [
      {
        title: "Exposé sur les volcans",
        description: "À envoyer sur Classroom.",
        category: "homework",
        deadlineDate: "2026-11-23",
        deadlineTime: "18:00",
      },
    ],
  },
  {
    id: "no-event-room-change",
    courseId: "lea-cm2",
    publishedAt: "2026-11-12T08:00:00+01:00",
    text: "Le cours de musique de vendredi est déplacé en salle B4.",
    expected: [],
  },
  {
    id: "day-month-only",
    courseId: "lea-cm2",
    publishedAt: "2026-11-12T08:00:00+01:00",
    text: "Dictée bilan le 3 décembre.",
    expected: [
      {
        title: "Dictée bilan",
        description: "Dictée bilan de la période.",
        category: "assessment",
        deadlineDate: "2026-12-03",
      },
    ],
  },
  {
    id: "back-to-school",
    courseId: "hugo-francais",
    publishedAt: "2026-12-18T16:00:00+01:00",
    text: "Lire le chapitre 5 du roman pour la rentrée.",
    expected: [
      {
        title: "Lire le chapitre 5 du roman",
        description: "Lecture pour la rentrée de janvier.",
        category: "homework",
        deadlineDate: "2027-01-04",
      },
    ],
  },
  {
    id: "payment-slip",
    courseId: "lea-cm2",
    publishedAt: "2026-11-23T08:00:00+01:00",
    text: "Le règlement de 12 euros pour la photo de classe est à rendre au plus tard le 4 décembre.",
    expected: [
      {
        title: "Règlement de la photo de classe",
        description: "12 euros à rendre.",
        category: "document_due",
        deadlineDate: "2026-12-04",
      },
    ],
  },
  {
    id: "in-fifteen-days",
    courseId: "hugo-sciences",
    publishedAt: "2026-11-09T08:00:00+01:00",
    text: "Évaluation de sciences dans 15 jours sur la digestion.",
    expected: [
      {
        title: "Évaluation de sciences sur la digestion",
        description: "Réviser le chapitre sur la digestion.",
        category: "assessment",
        deadlineDate: "2026-11-24",
      },
    ],
  },
  {
    id: "no-event-photos",
    courseId: "lea-cm2",
    publishedAt: "2026-12-21T10:00:00+01:00",
    text: "Les photos du spectacle de Noël sont en ligne sur l'espace de la classe.",
    expected: [],
  },
  {
    id: "this-friday",
    courseId: "hugo-francais",
    publishedAt: "2026-11-10T08:00:00+01:00",
    text: "Ce vendredi, interrogation orale de conjugaison.",
    expected: [
      {
        title: "Interrogation orale de conjugaison",
        description: "Interrogation orale en classe.",
        category: "assessment",
        deadlineDate: "2026-11-13",
      },
    ],
  },
  {
    id: "lesson-and-test",
    courseId: "hugo-francais",
    publishedAt: "2026-11-16T08:00:00+01:00",
    text: "Pour mercredi 18 novembre, apprendre la leçon 6. Contrôle sur les leçons 5 et 6 le lundi 23 novembre.",
    expected: [
      {
        title: "Apprendre la leçon 6",
        description: "Leçon 6 à savoir.",
        category: "homework",
        deadlineDate: "2026-11-18",
      },
      {
        title: "Contrôle sur les leçons 5 et 6",
        description: "Réviser les leçons 5 et 6.",
        category: "assessment",
        deadlineDate: "2026-11-23",
      },
    ],
  },
  {
    id: "swimming-certificate",
    courseId: "lea-cm2",
    publishedAt: "2027-01-04T08:00:00+01:00",
    text: "Le cycle piscine commence le jeudi 14 janvier. Le certificat médical est à rendre pour le lundi 11 janvier.",
    expected: [
      {
        title: "Début du cycle piscine",
        description: "Première séance de piscine.",
        category: "swimming",
        deadlineDate: "2027-01-14",
      },
      {
        title: "Certificat médical pour la piscine",
        description: "Certificat médical à rendre.",
        category: "document_due",
        deadlineDate: "2027-01-11",
      },
    ],
  },
  {
    id: "child-name-and-email",
    courseId: "lea-cm2",
    publishedAt: "2026-11-09T08:00:00+01:00",
    childName: "Léa",
    text: "Léa doit apporter son cahier de liaison signé jeudi 12 novembre. Questions : prof.exemple@ecole.example.",
    expected: [
      {
        title: "Cahier de liaison signé",
        description: "Apporter le cahier de liaison signé.",
        category: "document_due",
        deadlineDate: "2026-11-12",
      },
    ],
  },
  {
    id: "no-event-past",
    courseId: "lea-cm2",
    publishedAt: "2026-11-09T08:00:00+01:00",
    text: "Merci à tous pour la sortie de vendredi dernier, les enfants ont été formidables.",
    expected: [],
  },
  {
    id: "theatre-trip",
    courseId: "hugo-francais",
    publishedAt: "2027-01-11T08:00:00+01:00",
    text: "Sortie au théâtre le vendredi 29 janvier, prévoir un pique-nique.",
    expected: [
      {
        title: "Sortie au théâtre",
        description: "Prévoir un pique-nique.",
        category: "school_trip",
        deadlineDate: "2027-01-29",
      },
    ],
  },
  {
    id: "colours-friday",
    courseId: "lea-anglais",
    publishedAt: "2026-11-03T16:00:00+01:00",
    text: "Pour vendredi 6 novembre, apprendre les couleurs en anglais (fiche collée dans le cahier).",
    expected: [
      {
        title: "Apprendre les couleurs en anglais",
        description: "Fiche collée dans le cahier.",
        category: "homework",
        deadlineDate: "2026-11-06",
      },
    ],
  },
  {
    id: "animals-oral",
    courseId: "lea-anglais",
    publishedAt: "2026-11-17T16:00:00+01:00",
    text: "Petite évaluation orale sur les animaux mardi 24 novembre.",
    expected: [
      {
        title: "Évaluation orale sur les animaux",
        description: "Vocabulaire des animaux en anglais.",
        category: "assessment",
        deadlineDate: "2026-11-24",
      },
    ],
  },
  {
    id: "first-hour-test",
    courseId: "hugo-maths",
    publishedAt: "2026-11-02T18:00:00+01:00",
    text: "Interrogation sur les priorités opératoires jeudi 5 novembre en première heure (8h).",
    expected: [
      {
        title: "Interrogation sur les priorités opératoires",
        description: "En première heure.",
        category: "assessment",
        deadlineDate: "2026-11-05",
        deadlineTime: "08:00",
      },
    ],
  },
  {
    id: "homework-dm3",
    courseId: "hugo-maths",
    publishedAt: "2026-11-16T17:00:00+01:00",
    text: "DM n°3 à rendre lundi 30 novembre : exercices 12, 14 et 17 page 88.",
    expected: [
      {
        title: "DM n°3",
        description: "Exercices 12, 14 et 17 page 88.",
        category: "homework",
        deadlineDate: "2026-11-30",
      },
    ],
  },
  {
    id: "weekday-mismatch",
    courseId: "hugo-maths",
    publishedAt: "2026-11-18T12:00:00+01:00",
    text: "Contrôle commun de mathématiques jeudi 27 novembre.",
    expected: [
      {
        title: "Contrôle commun de mathématiques",
        description: "Le jour annoncé ne correspond pas à la date, à vérifier.",
        category: "assessment",
        deadlineDate: "2026-11-27",
        needsReview: true,
      },
    ],
  },
  {
    id: "essay-monday",
    courseId: "hugo-anglais",
    publishedAt: "2026-11-04T17:00:00+01:00",
    text: "Rendre la rédaction « My best holidays » lundi 9 novembre.",
    expected: [
      {
        title: "Rédaction « My best holidays »",
        description: "Rédaction à rendre en anglais.",
        category: "homework",
        deadlineDate: "2026-11-09",
      },
    ],
  },
  {
    id: "london-trip",
    courseId: "hugo-anglais",
    publishedAt: "2026-11-19T18:00:00+01:00",
    text: "Voyage linguistique à Londres du 15 au 19 mars 2027 : le formulaire d'inscription et la copie du passeport sont à rendre avant le 4 décembre.",
    expected: [
      {
        title: "Voyage linguistique à Londres",
        description: "Du 15 au 19 mars 2027.",
        category: "school_trip",
        deadlineDate: "2027-03-15",
      },
      {
        title: "Inscription au voyage à Londres",
        description: "Formulaire d'inscription et copie du passeport.",
        category: "document_due",
        deadlineDate: "2026-12-04",
      },
    ],
  },
  {
    id: "lab-coat",
    courseId: "hugo-sciences",
    publishedAt: "2026-11-05T17:00:00+01:00",
    text: "Apporter une blouse en coton pour le TP de jeudi prochain.",
    expected: [
      {
        title: "Blouse en coton pour le TP",
        description: "Apporter une blouse en coton.",
        category: "homework",
        deadlineDate: "2026-11-12",
      },
    ],
  },
  {
    id: "breathing-test",
    courseId: "hugo-sciences",
    publishedAt: "2026-11-20T17:00:00+01:00",
    text: "Évaluation sur la respiration le mardi 1er décembre à 10h.",
    expected: [
      {
        title: "Évaluation sur la respiration",
        description: "Réviser le chapitre sur la respiration.",
        category: "assessment",
        deadlineDate: "2026-12-01",
        deadlineTime: "10:00",
      },
    ],
  },
  {
    id: "poem",
    courseId: "lea-cm2",
    publishedAt: "2026-11-02T16:30:00+01:00",
    text: "Poésie « Il pleut » à savoir réciter pour le lundi 9 novembre.",
    expected: [
      {
        title: "Poésie « Il pleut »",
        description: "À savoir réciter.",
        category: "homework",
        deadlineDate: "2026-11-09",
      },
    ],
  },
  {
    id: "no-event-meeting",
    courseId: "lea-cm2",
    publishedAt: "2026-11-18T16:30:00+01:00",
    text: "Réunion parents-professeurs le jeudi 3 décembre à partir de 17h. Inscriptions sur le cahier de liaison.",
    expected: [],
  },
  {
    id: "library-trip",
    courseId: "lea-cm2",
    publishedAt: "2026-11-19T16:30:00+01:00",
    text: "Sortie à la médiathèque mardi 24 novembre après-midi. Pensez au goûter.",
    expected: [
      {
        title: "Sortie à la médiathèque",
        description: "L'après-midi, penser au goûter.",
        category: "school_trip",
        deadlineDate: "2026-11-24",
      },
    ],
  },
  {
    id: "no-event-cancelled",
    courseId: "lea-cm2",
    publishedAt: "2026-11-20T16:30:00+01:00",
    text: "La séance de piscine du jeudi 26 novembre est annulée, le bassin est fermé.",
    expected: [],
  },
  {
    id: "next-week-reading",
    courseId: "hugo-francais",
    publishedAt: "2026-11-03T17:00:00+01:00",
    text: "Lire les chapitres 1 à 4 du « Petit Prince » pour la semaine prochaine.",
    expected: [
      {
        title: "Lire les chapitres 1 à 4 du « Petit Prince »",
        description: "Pour la semaine prochaine, jour exact non précisé.",
        category: "homework",
        deadlineDate: "2026-11-09",
        needsReview: true,
      },
    ],
  },
  {
    id: "story-with-coursework",
    courseId: "hugo-francais",
    publishedAt: "2026-11-17T17:00:00+01:00",
    text: "Rédaction : rendre le récit d'aventure au plus tard vendredi 27 novembre à 17h sur Classroom.",
    expected: [
      {
        title: "Récit d'aventure",
        description: "À rendre sur Classroom.",
        category: "homework",
        deadlineDate: "2026-11-27",
        deadlineTime: "17:00",
      },
    ],
  },
  {
    id: "no-event-corrected",
    courseId: "hugo-maths",
    publishedAt: "2026-11-09T18:00:00+01:00",
    text: "Les copies du contrôle sont rendues, la correction est disponible sur l'ENT.",
    expected: [],
  },
  {
    id: "christmas-song",
    courseId: "lea-anglais",
    publishedAt: "2026-11-10T16:00:00+01:00",
    text: "Chanson de Noël à apprendre pour le spectacle du vendredi 18 décembre.",
    expected: [
      {
        title: "Chanson de Noël à apprendre",
        description: "Pour le spectacle de fin d'année.",
        category: "homework",
        deadlineDate: "2026-12-18",
      },
    ],
  },
  {
    id: "plant-visit",
    courseId: "hugo-sciences",
    publishedAt: "2026-11-12T17:00:00+01:00",
    text: "L'autorisation pour la visite de la station d'épuration est à rendre signée lundi 23 novembre ; la visite a lieu le jeudi 3 décembre.",
    expected: [
      {
        title: "Autorisation pour la station d'épuration",
        description: "Autorisation de sortie à rendre signée.",
        category: "document_due",
        deadlineDate: "2026-11-23",
      },
      {
        title: "Visite de la station d'épuration",
        description: "Sortie de la classe.",
        category: "school_trip",
        deadlineDate: "2026-12-03",
      },
    ],
  },
  {
    id: "mental-maths-tomorrow",
    courseId: "lea-cm2",
    publishedAt: "2026-11-16T16:30:00+01:00",
    text: "Évaluation de calcul mental demain.",
    expected: [
      {
        title: "Évaluation de calcul mental",
        description: "En classe.",
        category: "assessment",
        deadlineDate: "2026-11-17",
      },
    ],
  },
  {
    id: "grammar-two-weeks",
    courseId: "hugo-francais",
    publishedAt: "2026-11-04T17:00:00+01:00",
    text: "Contrôle de grammaire dans deux semaines, sur les compléments du verbe.",
    expected: [
      {
        title: "Contrôle de grammaire",
        description: "Sur les compléments du verbe.",
        category: "assessment",
        deadlineDate: "2026-11-18",
      },
    ],
  },
];

export const DATASET_COURSEWORK: readonly DatasetCoursework[] = [
  {
    id: "w-recit",
    courseId: "hugo-francais",
    title: "Récit d'aventure",
    due: { utcDate: "2026-11-27", utcTime: "16:00" },
    turnedIn: false,
  },
  {
    id: "w-fractions",
    courseId: "hugo-maths",
    title: "Fiche d'exercices sur les fractions",
    due: { utcDate: "2026-11-25" },
    turnedIn: false,
  },
  {
    id: "w-dm2",
    courseId: "hugo-maths",
    title: "DM n°2",
    due: { utcDate: "2026-11-12", utcTime: "16:00" },
    turnedIn: true,
  },
  {
    id: "w-schema",
    courseId: "hugo-sciences",
    title: "Schéma de l'appareil respiratoire",
    turnedIn: false,
  },
  {
    id: "w-vocab",
    courseId: "hugo-anglais",
    title: "Quiz de vocabulaire, unité 4",
    due: { utcDate: "2026-11-26", utcTime: "07:00" },
    turnedIn: false,
  },
  {
    id: "w-lecture",
    courseId: "lea-cm2",
    title: "Lecture : questionnaire du chapitre 2",
    due: { utcDate: "2026-11-20" },
    turnedIn: false,
  },
  {
    id: "w-colours",
    courseId: "lea-anglais",
    title: "Colorier la fiche des couleurs",
    due: { utcDate: "2026-11-04", utcTime: "15:00" },
    turnedIn: true,
  },
];

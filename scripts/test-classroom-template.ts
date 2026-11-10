import { DATASET_ANNOUNCEMENTS } from "@modules/extraction/eval/classroom-dataset";

export type DayWords = (day: number) => string;

export type TemplateText = string | ((on: DayWords) => string);

export type CourseKey = "maths" | "francais" | "histoire" | "svt" | "anglais" | "eps";

export interface TemplateAccount {
  localPart: string;
  givenName: string;
  familyName: string;
}

export interface TemplateCourse {
  key: CourseKey;
  name: string;
  section: string;
  teacher: TemplateAccount;
}

export interface TemplatePost {
  key: string;
  course: CourseKey;
  day: number;
  time: string;
}

export interface TemplateAnnouncement extends TemplatePost {
  text: TemplateText;
}

export interface TemplateDue {
  day: number;
  time?: string;
}

export interface TemplateCoursework extends TemplatePost {
  title: string;
  description: string;
  due?: TemplateDue;
}

export type LifeAction =
  | { kind: "announce"; course: CourseKey; text: TemplateText }
  | { kind: "edit-announcement"; announcement: string; text: TemplateText }
  | { kind: "move-coursework"; coursework: string; due: TemplateDue }
  | { kind: "remove-coursework"; coursework: string };

export interface LifeStep {
  step: number;
  label: string;
  actions: LifeAction[];
}

export interface ClassTemplate {
  version: number;
  prefix: string;
  students: TemplateAccount[];
  courses: TemplateCourse[];
  announcements: TemplateAnnouncement[];
  coursework: TemplateCoursework[];
  life: LifeStep[];
}

function evalText(id: string): string {
  const announcement = DATASET_ANNOUNCEMENTS.find((candidate) => candidate.id === id);
  if (!announcement) throw new Error(`the extraction eval has no announcement "${id}"`);

  return announcement.text;
}

const SECTION = "4e B";

const course = (key: CourseKey, subject: string, teacher: TemplateAccount): TemplateCourse => ({
  key,
  name: `[TEST] ${subject} ${SECTION}`,
  section: SECTION,
  teacher,
});

export const CLASS_TEMPLATE: ClassTemplate = {
  version: 1,
  prefix: "[TEST]",
  students: [
    { localPart: "eleve.jade", givenName: "Jade", familyName: "Morel" },
    { localPart: "eleve.noe", givenName: "Noé", familyName: "Morel" },
  ],
  courses: [
    course("maths", "Mathématiques", {
      localPart: "prof.maths",
      givenName: "Claire",
      familyName: "Royer",
    }),
    course("francais", "Français", {
      localPart: "prof.francais",
      givenName: "Julien",
      familyName: "Perrin",
    }),
    course("histoire", "Histoire-Géographie", {
      localPart: "prof.histoire",
      givenName: "Sophie",
      familyName: "Marchal",
    }),
    course("svt", "SVT", { localPart: "prof.svt", givenName: "Karim", familyName: "Benali" }),
    course("anglais", "Anglais", {
      localPart: "prof.anglais",
      givenName: "Laura",
      familyName: "Whitfield",
    }),
    course("eps", "EPS", { localPart: "prof.eps", givenName: "Antoine", familyName: "Fabre" }),
  ],
  announcements: [
    {
      key: "maths-homework-tomorrow",
      course: "maths",
      day: 0,
      time: "17:30",
      text: evalText("tomorrow"),
    },
    {
      key: "anglais-test-next-thursday",
      course: "anglais",
      day: 0,
      time: "17:00",
      text: evalText("next-weekday"),
    },
    {
      key: "histoire-trip",
      course: "histoire",
      day: 1,
      time: "08:00",
      text: (on) =>
        `Sortie au musée d'histoire de la ville ${on(23)}. L'autorisation signée et la participation de 8 euros sont à rendre avant ${on(11)}.`,
    },
    {
      key: "svt-lab-coat",
      course: "svt",
      day: 2,
      time: "17:00",
      text: evalText("lab-coat"),
    },
    {
      key: "francais-praise",
      course: "francais",
      day: 2,
      time: "12:00",
      text: evalText("no-event-praise"),
    },
    {
      key: "eps-swimming-gear",
      course: "eps",
      day: 3,
      time: "16:00",
      text: (on) =>
        `Cycle natation à partir du ${on(14)} : penser au bonnet, au maillot et à la serviette.`,
    },
    {
      key: "svt-test-in-fifteen-days",
      course: "svt",
      day: 4,
      time: "08:00",
      text: evalText("in-fifteen-days"),
    },
    {
      key: "francais-grammar-two-weeks",
      course: "francais",
      day: 7,
      time: "17:00",
      text: evalText("grammar-two-weeks"),
    },
    {
      key: "histoire-parents-meeting",
      course: "histoire",
      day: 8,
      time: "16:30",
      text: (on) =>
        `Réunion parents-professeurs ${on(17)} à partir de 17h. Inscriptions sur le cahier de liaison.`,
    },
    {
      key: "anglais-london-trip",
      course: "anglais",
      day: 9,
      time: "18:00",
      text: (on) =>
        `Voyage linguistique à Londres au printemps : le formulaire d'inscription et la copie de la carte d'identité sont à rendre avant ${on(18)}, l'acompte de 50 euros avant ${on(25)}.`,
    },
    {
      key: "francais-this-friday",
      course: "francais",
      day: 9,
      time: "08:00",
      text: evalText("this-friday"),
    },
    {
      key: "maths-test",
      course: "maths",
      day: 14,
      time: "08:00",
      text: (on) => `Contrôle de mathématiques ${on(24)} sur les équations.`,
    },
    {
      key: "eps-swimming-cancelled",
      course: "eps",
      day: 14,
      time: "17:00",
      text: (on) => `La séance de natation du ${on(17)} est annulée, le bassin est fermé.`,
    },
    {
      key: "histoire-essay",
      course: "histoire",
      day: 15,
      time: "17:00",
      text: (on) => `Exposé sur la révolution industrielle à rendre ${on(22)}.`,
    },
    {
      key: "svt-breathing-test",
      course: "svt",
      day: 16,
      time: "17:00",
      text: (on) => `Évaluation sur la respiration ${on(23)} à 10h.`,
    },
    {
      key: "svt-breathing-correction",
      course: "svt",
      day: 18,
      time: "17:00",
      text: (on) =>
        `Rectificatif : l'évaluation sur la respiration est avancée au ${on(22)}, même heure.`,
    },
    {
      key: "francais-reading-next-week",
      course: "francais",
      day: 21,
      time: "17:00",
      text: evalText("next-week-reading"),
    },
    {
      key: "maths-dm4",
      course: "maths",
      day: 23,
      time: "17:00",
      text: (on) => `DM n°4 à rendre ${on(29)} : exercices 12, 14 et 17 page 88.`,
    },
    {
      key: "histoire-photos",
      course: "histoire",
      day: 28,
      time: "12:00",
      text: "Les photos de la sortie sont en ligne sur l'espace de la classe.",
    },
    {
      key: "eps-orienteering",
      course: "eps",
      day: 29,
      time: "16:00",
      text: (on) =>
        `Course d'orientation au parc ${on(31)} : tenue de sport et gourde obligatoires.`,
    },
    {
      key: "histoire-form-before-holidays",
      course: "histoire",
      day: 30,
      time: "09:00",
      text: evalText("before-holidays"),
    },
    {
      key: "francais-back-to-school",
      course: "francais",
      day: 32,
      time: "16:00",
      text: evalText("back-to-school"),
    },
  ],
  coursework: [
    {
      key: "maths-sheet",
      course: "maths",
      day: 0,
      time: "18:00",
      title: "Fiche d'exercices : calcul littéral",
      description: "Exercices 1 à 6, à rendre en photo.",
      due: { day: 7, time: "18:00" },
    },
    {
      key: "francais-story",
      course: "francais",
      day: 2,
      time: "17:00",
      title: "Récit d'aventure",
      description: "Une page minimum, à déposer sur Classroom.",
      due: { day: 11, time: "17:00" },
    },
    {
      key: "svt-diagram",
      course: "svt",
      day: 3,
      time: "17:00",
      title: "Schéma de l'appareil respiratoire",
      description: "Schéma légendé, sans date limite.",
    },
    {
      key: "anglais-vocabulary-quiz",
      course: "anglais",
      day: 8,
      time: "18:00",
      title: "Quiz de vocabulaire, unité 4",
      description: "Quiz en ligne avant le cours.",
      due: { day: 10, time: "08:00" },
    },
    {
      key: "eps-swimming-log",
      course: "eps",
      day: 14,
      time: "17:30",
      title: "Carnet d'entraînement natation",
      description: "Noter chaque séance et son ressenti.",
      due: { day: 27 },
    },
    {
      key: "histoire-essay",
      course: "histoire",
      day: 15,
      time: "17:00",
      title: "Exposé : la révolution industrielle",
      description: "Diaporama de 5 diapositives.",
      due: { day: 22 },
    },
    {
      key: "francais-reading-quiz",
      course: "francais",
      day: 21,
      time: "17:30",
      title: "Questionnaire de lecture",
      description: "Questions sur les chapitres 1 à 4.",
      due: { day: 30, time: "18:00" },
    },
    {
      key: "maths-dm4",
      course: "maths",
      day: 23,
      time: "17:00",
      title: "DM n°4",
      description: "Exercices 12, 14 et 17 page 88.",
      due: { day: 29, time: "08:00" },
    },
  ],
  life: [
    {
      step: 1,
      label: "rectificatif : le contrôle de maths et le DM n°4 sont décalés",
      actions: [
        {
          kind: "announce",
          course: "maths",
          text: (on) =>
            `Rectificatif : le contrôle de mathématiques du ${on(24)} est déplacé au ${on(25)}.`,
        },
        { kind: "move-coursework", coursework: "maths-dm4", due: { day: 31, time: "08:00" } },
      ],
    },
    {
      step: 2,
      label: "annulation de la sortie au musée",
      actions: [
        {
          kind: "announce",
          course: "histoire",
          text: (on) =>
            `La sortie au musée du ${on(23)} est annulée. Les participations seront remboursées.`,
        },
      ],
    },
    {
      step: 3,
      label: "retrait du questionnaire de lecture",
      actions: [{ kind: "remove-coursework", coursework: "francais-reading-quiz" }],
    },
    {
      step: 4,
      label: "annonce de la course d'orientation modifiée en place (date reportée)",
      actions: [
        {
          kind: "edit-announcement",
          announcement: "eps-orienteering",
          text: (on) =>
            `Course d'orientation au parc reportée au ${on(32)} : tenue de sport et gourde obligatoires.`,
        },
      ],
    },
  ],
};

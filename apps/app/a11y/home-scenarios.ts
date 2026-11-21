import { mondayOf, shiftDate, weekdayOf } from "@packages/ddd-kit/days";
import {
  BUSY_WEEK,
  EVENTS,
  inDays,
  JADE,
  LEA,
  MAXIMILIEN,
  NEWCOMER,
  parisTime,
  REVIEW_EVENT,
  type SchoolCalendarFixture,
  TODAY,
  todayAt,
} from "./events-fixtures";
import { ARRANGED } from "./home-board";
import type { Block } from "./served-layout";

/**
 * One home a parent opens: who, when, what is due, and the question the home answers first. `hero`
 * is the block the advice crowns, `null` when the parent arranged the home (it no longer advises).
 * `wednesday` names the deadline due on a Wednesday the Agenda must show, when the week has one.
 */
export interface HomeScenario {
  name: string;
  question: string;
  now: Date;
  children: unknown[];
  events: unknown[];
  schoolCalendar: SchoolCalendarFixture;
  homeLayout: Block[] | null;
  hero: string | null;
  wednesday: string | null;
}

const WEDNESDAY = 3;

const MONDAY_TO_WEDNESDAY = 2;

const SUNDAY = 0;

const NO_HOLIDAY: SchoolCalendarFixture = { zone: "C", holidays: [], bankHolidays: [] };

const AUTUMN_BREAK = "Vacances d'automne";

/** The first Wednesday strictly after a day: in the week a phone's Agenda opens on, from that day. */
function wednesdayAfter(day: string): string {
  const ahead = (WEDNESDAY - weekdayOf(day) + 7) % 7 || 7;

  return shiftDate(day, ahead);
}

function sundayFrom(day: string): string {
  return shiftDate(day, (SUNDAY - weekdayOf(day) + 7) % 7);
}

const SUNDAY_DATE = sundayFrom(TODAY);

function due(index: number, day: string, fields: object) {
  return {
    ...REVIEW_EVENT,
    id: `7a8b9c0d-1e2f-4a3b-8c4d-${String(index).padStart(12, "0")}`,
    status: "confirmed",
    category: "homework",
    deadlineDate: day,
    deadlineAt: `${day}T07:00:00.000Z`,
    ...fields,
  };
}

const WEDNESDAY_TITLE = "Exposé sur les volcans";

/**
 * A deadline on each Wednesday the Agenda can open on from a day: the one of its week (a tablet or
 * a computer opens on Monday) and the next one (a phone opens on the day). Wednesday carries
 * deadlines like any other day.
 */
function wednesdayDeadlines(index: number, day: string, childId: string) {
  const days = [shiftDate(mondayOf(day), MONDAY_TO_WEDNESDAY), wednesdayAfter(day)];

  return days.map((wednesday, offset) =>
    due(index + offset, wednesday, { childId, title: WEDNESDAY_TITLE }),
  );
}

/** An ordinary week: a few homeworks, one test, one form to sign, one left late, one on Wednesday. */
const USUAL_WEEK = [
  ...EVENTS,
  due(1, inDays(2), { category: "assessment", title: "Contrôle de conjugaison" }),
  due(2, inDays(1), {
    category: "document_due",
    childId: MAXIMILIEN.id,
    title: "Autorisation de sortie",
  }),
  due(3, inDays(-1), { title: "Fiche de lecture" }),
  ...wednesdayDeadlines(4, TODAY, MAXIMILIEN.id),
];

/** What leaves in the school bag this morning: a poem to recite, a swimming bag, a signed slip. */
const SCHOOL_BAG = [
  due(40, TODAY, { title: "Réciter la poésie « Le Corbeau et le Renard »" }),
  due(41, TODAY, {
    category: "swimming",
    childId: MAXIMILIEN.id,
    title: "Sac de piscine : maillot, bonnet, lunettes",
  }),
  due(42, TODAY, { category: "document_due", title: "Coupon de la réunion de rentrée signé" }),
];

const LEAS_BAG = SCHOOL_BAG.filter((event) => event.childId === LEA.id);

/** An ordinary week seen in the morning: the same, with what is due today. */
const USUAL_MORNING = [...USUAL_WEEK, ...SCHOOL_BAG.slice(0, 2)];

const ONE_CHILD_WEEK = USUAL_WEEK.filter((event) => event.childId === LEA.id).concat(
  wednesdayDeadlines(6, TODAY, LEA.id),
  LEAS_BAG,
);

/** Two homeworks and nothing else: no test, no form, nothing late. */
const CALM_WEEK = [
  due(10, inDays(1), { title: "Lire le chapitre 4" }),
  ...wednesdayDeadlines(11, TODAY, MAXIMILIEN.id),
];

const SUNDAY_WEEK = [
  due(20, shiftDate(SUNDAY_DATE, 1), { title: "Poésie à réciter" }),
  due(21, shiftDate(SUNDAY_DATE, 2), {
    category: "assessment",
    childId: JADE.id,
    title: "Contrôle de géométrie",
  }),
  due(22, shiftDate(SUNDAY_DATE, 4), {
    category: "document_due",
    childId: MAXIMILIEN.id,
    title: "Fiche d'inscription à la cantine",
  }),
  ...wednesdayDeadlines(23, SUNDAY_DATE, JADE.id),
];

const BREAK_ENDS_ON = inDays(8);

const DURING_BREAK: SchoolCalendarFixture = {
  zone: "C",
  holidays: [{ name: AUTUMN_BREAK, startsOn: inDays(-3), endsOn: BREAK_ENDS_ON }],
  bankHolidays: [],
};

/** During the break the Agenda opens on the week school starts again: its Wednesday has a deadline too. */
const BREAK_WEEK = [
  ...CALM_WEEK,
  due(30, wednesdayAfter(BREAK_ENDS_ON), { title: WEDNESDAY_TITLE }),
];

const ENDING_BREAK: SchoolCalendarFixture = {
  zone: "C",
  holidays: [{ name: AUTUMN_BREAK, startsOn: inDays(-8), endsOn: inDays(1) }],
  bankHolidays: [],
};

const FAMILY = [LEA, MAXIMILIEN];

/** The ten homes the advice is checked on, the same ones the reference shots show. */
export const HOME_SCENARIOS: readonly HomeScenario[] = [
  {
    name: "morning-two-children",
    question: "Qu'est-ce qu'on a aujourd'hui ?",
    now: todayAt("08:00"),
    children: FAMILY,
    events: USUAL_MORNING,
    schoolCalendar: NO_HOLIDAY,
    homeLayout: null,
    hero: "today",
    wednesday: WEDNESDAY_TITLE,
  },
  {
    name: "evening-two-children",
    question: "Qu'est-ce qu'on prépare ce soir pour demain ?",
    now: todayAt("19:00"),
    children: FAMILY,
    events: USUAL_WEEK,
    schoolCalendar: NO_HOLIDAY,
    homeLayout: null,
    hero: "tonight",
    wednesday: WEDNESDAY_TITLE,
  },
  {
    name: "sunday-three-children",
    question: "À quoi ressemble la semaine de chacun ?",
    now: parisTime(SUNDAY_DATE, "10:00"),
    children: [...FAMILY, JADE],
    events: SUNDAY_WEEK,
    schoolCalendar: NO_HOLIDAY,
    homeLayout: null,
    hero: "calendar",
    wednesday: WEDNESDAY_TITLE,
  },
  {
    name: "morning-one-child",
    question: "Qu'est-ce qu'elle a aujourd'hui ?",
    now: todayAt("08:00"),
    children: [LEA],
    events: ONE_CHILD_WEEK,
    schoolCalendar: NO_HOLIDAY,
    homeLayout: null,
    hero: "today",
    wednesday: WEDNESDAY_TITLE,
  },
  {
    name: "new-parent",
    question: "Par où je commence ?",
    now: todayAt("08:00"),
    children: [NEWCOMER],
    events: [],
    schoolCalendar: NO_HOLIDAY,
    homeLayout: null,
    hero: "welcome",
    wednesday: null,
  },
  {
    name: "calm-week",
    question: "Y a-t-il quelque chose cette semaine ?",
    now: todayAt("08:00"),
    children: FAMILY,
    events: CALM_WEEK,
    schoolCalendar: NO_HOLIDAY,
    homeLayout: null,
    hero: "today",
    wednesday: WEDNESDAY_TITLE,
  },
  {
    name: "busy-week",
    question: "Qu'est-ce qui presse aujourd'hui, avec tout ce qui arrive ?",
    now: todayAt("08:00"),
    children: FAMILY,
    events: [...BUSY_WEEK, ...SCHOOL_BAG],
    schoolCalendar: NO_HOLIDAY,
    homeLayout: null,
    hero: "today",
    wednesday: null,
  },
  {
    name: "holidays",
    question: "Reste-t-il quelque chose à faire pendant les vacances ?",
    now: todayAt("10:00"),
    children: FAMILY,
    events: BREAK_WEEK,
    schoolCalendar: DURING_BREAK,
    homeLayout: null,
    hero: "calendar",
    wednesday: WEDNESDAY_TITLE,
  },
  {
    name: "back-to-school-eve",
    question: "Qu'est-ce qu'on prépare pour la rentrée ?",
    now: todayAt("19:00"),
    children: FAMILY,
    events: USUAL_WEEK,
    schoolCalendar: ENDING_BREAK,
    homeLayout: null,
    hero: "tonight",
    wednesday: WEDNESDAY_TITLE,
  },
  {
    name: "arranged",
    question: "Mon accueil, tel que je l'ai rangé.",
    now: todayAt("09:00"),
    children: FAMILY,
    events: USUAL_WEEK,
    schoolCalendar: NO_HOLIDAY,
    homeLayout: ARRANGED,
    hero: null,
    wednesday: WEDNESDAY_TITLE,
  },
];

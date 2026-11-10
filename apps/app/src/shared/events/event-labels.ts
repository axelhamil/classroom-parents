import type { EVENT_CATEGORIES } from "@packages/events/agenda-contract";
import type { EventItem } from "../api/queries/events";

export type EventCategory = (typeof EVENT_CATEGORIES)[number];

export const CATEGORY_LABEL_KEYS = {
  assessment: "categories.assessment",
  homework: "categories.homework",
  school_trip: "categories.school_trip",
  swimming: "categories.swimming",
  document_due: "categories.document_due",
} as const satisfies Record<EventCategory, string>;

export const CATEGORY_BADGE_VARIANTS = {
  assessment: "assessment",
  homework: "homework",
  school_trip: "schoolTrip",
  swimming: "swimming",
  document_due: "documentDue",
} as const satisfies Record<EventCategory, string>;

export const SOURCE_LABEL_KEYS = {
  announcement: "sources.announcement",
  coursework: "sources.coursework",
} as const satisfies Record<EventItem["source"], string>;

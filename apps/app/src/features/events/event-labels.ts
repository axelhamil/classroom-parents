import type { EventItem } from "./api/events.queries";

export const EVENT_CATEGORIES = [
  "assessment",
  "homework",
  "school_trip",
  "swimming",
  "document_due",
] as const;

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

export const BLOCKED_LABEL_KEYS = {
  needs_reconnect: "blocked.needs_reconnect",
  blocked_by_school: "blocked.blocked_by_school",
} as const;

import type { EVENT_CATEGORIES } from "@packages/events/agenda-contract";
import { CATEGORY_ICONS, type CategoryTone } from "@packages/ui/components/ui/icons";
import type { EventItem } from "../api/queries/events";

export type EventCategory = (typeof EVENT_CATEGORIES)[number];

export const CATEGORY_LABEL_KEYS = {
  assessment: "categories.assessment",
  homework: "categories.homework",
  school_trip: "categories.school_trip",
  swimming: "categories.swimming",
  document_due: "categories.document_due",
  other: "categories.other",
} as const satisfies Record<EventCategory, string>;

export const CATEGORY_TONES = {
  assessment: "assessment",
  homework: "homework",
  school_trip: "schoolTrip",
  swimming: "swimming",
  document_due: "documentDue",
  other: "other",
} as const satisfies Record<EventCategory, CategoryTone>;

export function categoryIcon(category: EventCategory) {
  return CATEGORY_ICONS[CATEGORY_TONES[category]];
}

export const ORIGIN_LABEL_KEYS = {
  announcement: "origins.announcement",
  coursework: "origins.coursework",
  manual: "origins.manual",
} as const satisfies Record<EventItem["source"], string>;

import type { EVENT_CATEGORIES } from "@packages/events/agenda-contract";
import {
  BookOpenIcon,
  BusIcon,
  ClipboardCheckIcon,
  type LucideIcon,
  NotebookPenIcon,
  PenLineIcon,
  WavesIcon,
} from "lucide-react";
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

export const CATEGORY_BADGE_VARIANTS = {
  assessment: "assessment",
  homework: "homework",
  school_trip: "schoolTrip",
  swimming: "swimming",
  document_due: "documentDue",
  other: "secondary",
} as const satisfies Record<EventCategory, string>;

export const CATEGORY_ICONS = {
  assessment: ClipboardCheckIcon,
  homework: BookOpenIcon,
  school_trip: BusIcon,
  swimming: WavesIcon,
  document_due: PenLineIcon,
  other: NotebookPenIcon,
} as const satisfies Record<EventCategory, LucideIcon>;

export const SOURCE_LABEL_KEYS = {
  announcement: "sources.announcement",
  coursework: "sources.coursework",
  manual: "sources.manual",
} as const satisfies Record<EventItem["source"], string>;

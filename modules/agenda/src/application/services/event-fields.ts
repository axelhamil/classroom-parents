import { Result } from "@packages/ddd-kit";
import {
  CLASSROOM_CATEGORIES,
  EVENT_DESCRIPTION_MAX,
  EVENT_TITLE_MAX,
} from "@packages/events/agenda-contract";
import { z } from "zod";
import {
  CALENDAR_RANGE_MAX_DAYS,
  CalendarRange,
} from "../../domain/value-objects/calendar-range.vo";
import { EventCategory, eventCategorySchema } from "../../domain/value-objects/event-category.vo";
import { EventDeadline } from "../../domain/value-objects/event-deadline.vo";
import { EventDescription } from "../../domain/value-objects/event-description.vo";
import { EventTitle } from "../../domain/value-objects/event-title.vo";
import type { AgendaError } from "../ports/event-repository.port";

const classroomCategorySchema = z.enum(CLASSROOM_CATEGORIES);

const invalidTitle: AgendaError = {
  code: "EVENT_TITLE_INVALID",
  message: `Le titre doit faire entre 1 et ${EVENT_TITLE_MAX} caractères.`,
};

const invalidDescription: AgendaError = {
  code: "EVENT_DESCRIPTION_INVALID",
  message: `La description doit faire au plus ${EVENT_DESCRIPTION_MAX} caractères.`,
};

const invalidCategory: AgendaError = {
  code: "EVENT_CATEGORY_INVALID",
  message:
    "Choisissez une catégorie parmi évaluation, devoir, sortie scolaire, piscine, document à rendre ou autre.",
};

const invalidDeadline: AgendaError = {
  code: "EVENT_DEADLINE_INVALID",
  message:
    "Cette date ou cette heure n'existe pas. Choisissez une date réelle et une heure entre 00:00 et 23:59, hors de 02:00 à 02:59 le jour du passage à l'heure d'été.",
};

const invalidRange: AgendaError = {
  code: "EVENT_RANGE_INVALID",
  message: `Choisissez une période de ${CALENDAR_RANGE_MAX_DAYS} jours au plus, dont la date de début précède la date de fin.`,
};

export function parseRange(from: string, to: string): Result<CalendarRange, AgendaError> {
  return CalendarRange.between(from, to).mapError(() => invalidRange);
}

export function parseTitle(raw: string): Result<EventTitle, AgendaError> {
  return EventTitle.create(raw).mapError(() => invalidTitle);
}

export function parseDescription(raw: string): Result<EventDescription, AgendaError> {
  return EventDescription.create(raw).mapError(() => invalidDescription);
}

export function parseCategory(raw: string): Result<EventCategory, AgendaError> {
  const known = eventCategorySchema.safeParse(raw);
  if (!known.success) return Result.fail(invalidCategory);

  return EventCategory.create(known.data).mapError(() => invalidCategory);
}

export function parseClassroomCategory(raw: string): Result<EventCategory, AgendaError> {
  if (!classroomCategorySchema.safeParse(raw).success) return Result.fail(invalidCategory);

  return parseCategory(raw);
}

export function parseDeadline(date: string, time?: string): Result<EventDeadline, AgendaError> {
  return EventDeadline.fromParisWallTime(date, time).mapError(() => invalidDeadline);
}

export function parseComputedDeadline(
  date: string,
  time?: string,
): Result<EventDeadline, AgendaError> {
  return EventDeadline.fromComputedParisWallTime(date, time).mapError(() => invalidDeadline);
}

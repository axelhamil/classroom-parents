import { Result } from "@packages/ddd-kit";
import { EventCategory, eventCategorySchema } from "../../domain/value-objects/event-category.vo";
import { EventDeadline } from "../../domain/value-objects/event-deadline.vo";
import {
  EVENT_DESCRIPTION_MAX,
  EventDescription,
} from "../../domain/value-objects/event-description.vo";
import { EVENT_TITLE_MAX, EventTitle } from "../../domain/value-objects/event-title.vo";
import type { AgendaError } from "../ports/event-repository.port";

export const eventNotFound: AgendaError = {
  code: "EVENT_NOT_FOUND",
  message: "Cet événement n'existe pas ou a été supprimé.",
};

const invalidTitle: AgendaError = {
  code: "EVENT_INVALID_TITLE",
  message: `Le titre doit faire entre 1 et ${EVENT_TITLE_MAX} caractères.`,
};

const invalidDescription: AgendaError = {
  code: "EVENT_INVALID_DESCRIPTION",
  message: `La description doit faire au plus ${EVENT_DESCRIPTION_MAX} caractères.`,
};

const invalidCategory: AgendaError = {
  code: "EVENT_INVALID_CATEGORY",
  message:
    "Choisissez une catégorie parmi évaluation, devoir, sortie scolaire, piscine ou document à rendre.",
};

const invalidDeadline: AgendaError = {
  code: "EVENT_INVALID_DEADLINE",
  message:
    "Cette date ou cette heure n'existe pas. Choisissez une date réelle et une heure entre 00:00 et 23:59.",
};

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

export function parseDeadline(date: string, time?: string): Result<EventDeadline, AgendaError> {
  return EventDeadline.fromParisWallTime(date, time).mapError(() => invalidDeadline);
}

import { EVENT_DESCRIPTION_MAX, EVENT_TITLE_MAX } from "@packages/events/agenda-contract";
import type { NewEventSearch } from "./events.schema";
import type { EventDraft } from "./forms/add-event-form";

function linesOf(text: string | undefined): string[] {
  return (text ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function descriptionOf(heading: string, details: string[], link: string | undefined): string {
  const cutHeading = heading.length > EVENT_TITLE_MAX ? [heading] : [];
  const newLink = link && !details.includes(link) ? [link] : [];

  return [...cutHeading, ...details, ...newLink].join("\n").slice(0, EVENT_DESCRIPTION_MAX);
}

export function sharedDraft({ title, text, url }: NewEventSearch): EventDraft {
  const lines = linesOf(text);
  const sharedTitle = title?.trim();
  const heading = sharedTitle || lines[0] || "";
  const details = sharedTitle ? lines.filter((line) => line !== sharedTitle) : lines.slice(1);

  return {
    title: heading.slice(0, EVENT_TITLE_MAX),
    description: descriptionOf(heading, details, url?.trim()),
  };
}

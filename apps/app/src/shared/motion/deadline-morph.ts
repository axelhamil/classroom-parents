const MORPH = "data-deadline-morph";
const CARD = '[data-slot="planner-card"], [data-slot="calendar-entry"]';

/**
 * Names the tear-off date of the card a deadline is opened from (the card itself
 * when it carries none), so the opening view transition carries it into the
 * sheet's heading. Only one element may hold the name at a time.
 */
export function departFrom(link: HTMLElement): void {
  arrive();
  const card = link.closest(CARD);
  const date = card?.querySelector('[data-slot="date-tab"]') ?? card;
  date?.setAttribute(MORPH, "");
}

/**
 * Takes the name back once the sheet is in the page, in the same commit: the
 * card stays under the sheet, and two elements sharing a name in the new state
 * would cancel the transition.
 */
export function arrive(): void {
  for (const element of document.querySelectorAll(`[${MORPH}]`)) element.removeAttribute(MORPH);
}

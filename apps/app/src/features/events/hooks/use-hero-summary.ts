import { useTranslation } from "react-i18next";
import type { SchoolClock } from "../../../shared/agenda/school-clock";
import { countByChild, weekLoadView } from "../../../shared/agenda/views";
import { nextSevenDays } from "../../../shared/agenda/windows";
import type { ChildDto } from "../../../shared/api/queries/children";
import type { EventItem } from "../../../shared/api/queries/events";
import { useTileFrame } from "../../../shared/dashboard/tile-frame";
import type { AdviceSnapshot } from "../advise-context";
import { heroSummaryOf, sayHeroSummary } from "../hero-summary";

export interface HeroSummarySource {
  advice: AdviceSnapshot | null;
  family: readonly ChildDto[];
  clock: SchoolClock;
  childId: string | null;
}

/**
 * The sentence under the hero, when the tile is the hero: what it lists counted per child, or the
 * week's count when the week is calm, or the holidays. `listed` is what the hero answers with.
 */
export function useHeroSummary(
  { advice, family, clock, childId }: HeroSummarySource,
  events: readonly EventItem[],
  listed: readonly EventItem[],
): string | undefined {
  const { t } = useTranslation("home");
  const { hero } = useTileFrame();
  if (!hero || !advice) return undefined;

  const perChild = countByChild(listed, family);
  const week = {
    count: weekLoadView(events, clock, childId).open.length,
    until: nextSevenDays.range(clock).to,
  };

  return sayHeroSummary(
    t,
    heroSummaryOf({ context: advice.context, holiday: advice.holiday, perChild, week }),
  );
}

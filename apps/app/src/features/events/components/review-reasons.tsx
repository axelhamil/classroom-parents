import { DeadlineQuote } from "@packages/ui/components/ui/deadline-sheet";
import { TypographyList, TypographyMuted } from "@packages/ui/components/ui/typography";
import { useTranslation } from "react-i18next";
import type { EventItem } from "../../../shared/api/queries/events";
import { reviewSentenceKeys } from "../review-labels";

export interface ReviewReasonsProps {
  event: EventItem;
}

export function ReviewReasons({ event }: ReviewReasonsProps) {
  const { t } = useTranslation("events");

  return (
    <>
      <TypographyList>
        {reviewSentenceKeys(event).map((key) => (
          <li key={key}>{t(key)}</li>
        ))}
      </TypographyList>
      {event.evidenceQuote && (
        <figure className="flex flex-col gap-1">
          <figcaption>
            <TypographyMuted>{t("review.quote")}</TypographyMuted>
          </figcaption>
          <DeadlineQuote dir="auto">{event.evidenceQuote}</DeadlineQuote>
        </figure>
      )}
    </>
  );
}

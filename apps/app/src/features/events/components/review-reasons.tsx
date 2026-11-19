import { DeadlineQuote } from "@packages/ui/components/ui/deadline-sheet";
import { TypographyList, TypographyMuted } from "@packages/ui/components/ui/typography";
import { useTranslation } from "react-i18next";
import type { EventItem } from "../../../shared/api/queries/events";
import { reviewSentenceKeys } from "../review-labels";

export interface ReviewReasonsProps {
  event: EventItem;
  inContext?: boolean;
}

export function ReviewReasons({ event, inContext = false }: ReviewReasonsProps) {
  const { t } = useTranslation("events");
  const evidence = event.evidence;

  return (
    <>
      <TypographyList>
        {reviewSentenceKeys(event).map((key) => (
          <li key={key}>{t(key)}</li>
        ))}
      </TypographyList>
      {evidence && (
        <figure className="flex flex-col gap-1">
          <figcaption>
            <TypographyMuted>
              {t(inContext ? "review.quoteInContext" : "review.quote")}
            </TypographyMuted>
          </figcaption>
          <DeadlineQuote dir="auto">
            {inContext ? (
              <>
                {evidence.before}
                <mark>{evidence.quote}</mark>
                {evidence.after}
              </>
            ) : (
              evidence.quote
            )}
          </DeadlineQuote>
        </figure>
      )}
    </>
  );
}

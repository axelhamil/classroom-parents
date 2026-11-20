import { Button } from "@packages/ui/components/ui/button";
import { ChildAvatar } from "@packages/ui/components/ui/child-avatar";
import { ListRow, ListRowAction, ListRowContent } from "@packages/ui/components/ui/list-row";
import { ScrollRegion } from "@packages/ui/components/ui/scroll-region";
import { TypographyInline } from "@packages/ui/components/ui/typography";
import { Link } from "@tanstack/react-router";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import type { ChildDto } from "../../../../shared/api/queries/children";
import type { EventItem } from "../../../../shared/api/queries/events";
import { childAvatarSrc } from "../../../../shared/children/child-avatar-src";
import { childHue, childLabelOf } from "../../../../shared/format/child-hue";
import { deadlineLabel, inSentence } from "../../../../shared/format/deadline-label";
import { reflow } from "../../../../shared/motion/reflow";
import { useReviewConfirmation } from "../../hooks/use-review-confirmation";
import { reviewSentenceKeys } from "../../review-labels";

const INLINE_ROWS = 20;

export interface ReviewRowsProps {
  events: readonly EventItem[];
  family: readonly ChildDto[];
  today: string;
  onLastLeft: () => void;
}

export function ReviewRows({ events, family, today, onLastLeft }: ReviewRowsProps) {
  const { t } = useTranslation("home");
  const list = useRef<HTMLUListElement>(null);
  const confirm = useReviewConfirmation();

  const confirmRow = (event: EventItem, trigger: HTMLElement) => {
    const next = neighbourConfirm(trigger);

    reflow(list.current, () => {
      void confirm(event).then(() => (next ? next.focus() : onLastLeft()));
    });
  };

  return (
    <ScrollRegion
      variant="list"
      label={t("blocks.review.list")}
      className="hidden min-h-0 flex-1 md:contain-size @2xs/panel:block"
    >
      <ul ref={list} className="flex flex-col">
        {events.slice(0, INLINE_ROWS).map((event) => (
          <ReviewRow
            key={event.id}
            event={event}
            family={family}
            today={today}
            onConfirm={(trigger) => confirmRow(event, trigger)}
          />
        ))}
      </ul>
    </ScrollRegion>
  );
}

function neighbourConfirm(trigger: HTMLElement): HTMLElement | null {
  const row = trigger.closest("li");
  const neighbour = row?.nextElementSibling ?? row?.previousElementSibling;

  return neighbour?.querySelector<HTMLElement>("[data-review-confirm]") ?? null;
}

interface ReviewRowProps {
  event: EventItem;
  family: readonly ChildDto[];
  today: string;
  onConfirm: (trigger: HTMLElement) => void;
}

function ReviewRow({ event, family, today, onConfirm }: ReviewRowProps) {
  const { t } = useTranslation(["home", "events"]);
  const child = family.find((candidate) => candidate.id === event.childId);
  const name = childLabelOf(family, event.childId);
  const [reason] = reviewSentenceKeys(event);
  const quote = event.evidence?.quote;

  return (
    <ListRow variant="stacked">
      <ChildAvatar
        name={name}
        label={name}
        tone={childHue(family, event.childId)}
        src={child ? childAvatarSrc(child) : undefined}
        size="sm"
      />
      <ListRowContent className="min-w-0 flex-1">
        <TypographyInline weight="semibold" className="line-clamp-2 @md/panel:line-clamp-1">
          {event.title}
        </TypographyInline>
        <TypographyInline size="sm" tone="muted">
          {t("blocks.review.proposed", {
            when: inSentence(deadlineLabel(event.deadlineDate, event.deadlineTime, today)),
          })}
        </TypographyInline>
        {reason && (
          <TypographyInline size="sm" className="line-clamp-2">
            {t(reason, { ns: "events" })}
          </TypographyInline>
        )}
        {quote && (
          <TypographyInline size="sm" tone="muted" dir="auto" className="line-clamp-1">
            {t("blocks.review.quote", { quote })}
          </TypographyInline>
        )}
      </ListRowContent>
      <ListRowAction className="ms-11 basis-full flex-wrap @md/panel:ms-0 @md/panel:basis-auto @md/panel:self-center">
        <Button
          type="button"
          size="sm"
          aria-label={t("blocks.review.confirmNamed", { title: event.title })}
          data-review-confirm
          onClick={(click) => onConfirm(click.currentTarget)}
        >
          {t("blocks.review.confirm")}
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link
            to="/events/$eventId/edit"
            params={{ eventId: event.id }}
            aria-label={t("blocks.review.fixNamed", { title: event.title })}
          >
            {t("blocks.review.fix")}
          </Link>
        </Button>
      </ListRowAction>
    </ListRow>
  );
}

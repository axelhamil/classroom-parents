import { Button } from "@packages/ui/components/ui/button";
import { ChildAvatar } from "@packages/ui/components/ui/child-avatar";
import { ListRow, ListRowAction, ListRowContent } from "@packages/ui/components/ui/list-row";
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
import { reviewSentenceKeys } from "../../review-labels";

const INLINE_ROWS = 20;

const GLANCE_ROWS = 2;

export interface ReviewRowsProps {
  events: readonly EventItem[];
  family: readonly ChildDto[];
  today: string;
  confirm: (event: EventItem) => Promise<void>;
  onLastLeft: () => void;
  compact?: boolean;
}

export function ReviewRows({
  events,
  family,
  today,
  confirm,
  onLastLeft,
  compact = false,
}: ReviewRowsProps) {
  const { t } = useTranslation("home");
  const list = useRef<HTMLUListElement>(null);

  const confirmRow = (event: EventItem, trigger: HTMLElement) => {
    const next = neighbourConfirm(trigger);

    reflow(list.current, () => {
      void confirm(event).then(() => (next ? next.focus() : onLastLeft()));
    });
  };

  return (
    <ul
      ref={list}
      aria-label={t("blocks.review.list")}
      className={
        compact
          ? "flex min-h-0 flex-1 flex-col [container-type:size] [@container(max-height:6rem)]:[&>li:nth-child(n+2)]:hidden [@container(max-height:3.5rem)]:[&_[data-when]]:hidden"
          : "flex flex-col"
      }
    >
      {events.slice(0, compact ? GLANCE_ROWS : INLINE_ROWS).map((event) => (
        <ReviewRow
          key={event.id}
          event={event}
          family={family}
          today={today}
          compact={compact}
          onConfirm={(trigger) => confirmRow(event, trigger)}
        />
      ))}
    </ul>
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
  compact: boolean;
  onConfirm: (trigger: HTMLElement) => void;
}

function ReviewRow({ event, family, today, compact, onConfirm }: ReviewRowProps) {
  const { t } = useTranslation(["home", "events"]);
  const child = family.find((candidate) => candidate.id === event.childId);
  const name = childLabelOf(family, event.childId);
  const [reason] = reviewSentenceKeys(event);
  const quote = event.evidence?.quote;
  const when = inSentence(deadlineLabel(event.deadlineDate, event.deadlineTime, today));
  const actions = <ReviewActions event={event} onConfirm={onConfirm} />;

  if (compact)
    return (
      <ListRow variant="ruled" className="shrink-0 py-1">
        <ListRowContent className="min-w-0 flex-1 gap-0">
          <TypographyInline weight="semibold" className="line-clamp-1">
            {event.title}
          </TypographyInline>
          <TypographyInline size="sm" tone="muted" className="line-clamp-1" data-when>
            {t("blocks.review.proposed", { when })}
          </TypographyInline>
        </ListRowContent>
        <ListRowAction>{actions}</ListRowAction>
      </ListRow>
    );

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
          {t("blocks.review.proposed", { when })}
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
        {actions}
      </ListRowAction>
    </ListRow>
  );
}

interface ReviewActionsProps {
  event: EventItem;
  onConfirm: (trigger: HTMLElement) => void;
}

function ReviewActions({ event, onConfirm }: ReviewActionsProps) {
  const { t } = useTranslation("home");

  return (
    <>
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
    </>
  );
}

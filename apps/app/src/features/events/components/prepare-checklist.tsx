import { Badge } from "@packages/ui/components/ui/badge";
import { Checkbox } from "@packages/ui/components/ui/checkbox";
import {
  Checklist,
  type ChecklistDensity,
  ChecklistItem,
} from "@packages/ui/components/ui/checklist";
import { DeadlineQuote } from "@packages/ui/components/ui/deadline-sheet";
import { IconButton } from "@packages/ui/components/ui/icon-button";
import { AllDoneIcon, CloseIcon, SuggestionIcon } from "@packages/ui/components/ui/icons";
import { Label } from "@packages/ui/components/ui/label";
import { Separator } from "@packages/ui/components/ui/separator";
import { TypographyH2, TypographyMuted } from "@packages/ui/components/ui/typography";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import type { EventItem } from "../../../shared/api/queries/events";
import { ChecklistItemForm } from "../forms/checklist-item-form";
import {
  type ChecklistEntry,
  type Checklist as ChecklistState,
  useChecklist,
} from "../hooks/use-checklist";

interface ChecklistRowsProps {
  checklist: ChecklistState;
  entries: ChecklistEntry[];
  suggested?: boolean;
  removable?: boolean;
  density?: ChecklistDensity;
  labelledBy?: string;
}

function ChecklistRows({
  checklist,
  entries,
  suggested = false,
  removable = false,
  density,
  labelledBy,
}: ChecklistRowsProps) {
  const { t } = useTranslation("events");
  const prefix = useId();

  return (
    <Checklist density={density} aria-labelledby={labelledBy}>
      {entries.map((item) => {
        const id = `${prefix}-${item.id}`;

        return (
          <ChecklistItem key={item.id} density={density}>
            <Checkbox
              id={id}
              checked={item.done}
              aria-description={suggested ? t("prepare.suggestion") : undefined}
              onCheckedChange={(checked) => checklist.toggle(item.id, checked === true)}
            />
            {suggested && <SuggestionIcon aria-hidden />}
            <Label htmlFor={id}>{item.label}</Label>
            {removable && item.removable && (
              <IconButton
                type="button"
                variant="ghost"
                size="icon-sm"
                label={t("prepare.remove", { item: item.label })}
                onClick={() => checklist.remove(item.id)}
              >
                <CloseIcon aria-hidden />
              </IconButton>
            )}
          </ChecklistItem>
        );
      })}
    </Checklist>
  );
}

interface SuggestedStepsProps {
  checklist: ChecklistState;
  removable?: boolean;
  density?: ChecklistDensity;
}

function SuggestedSteps({ checklist, removable, density }: SuggestedStepsProps) {
  if (checklist.suggested.length === 0) return null;

  return (
    <ChecklistRows
      checklist={checklist}
      entries={checklist.suggested}
      suggested
      removable={removable}
      density={density}
    />
  );
}

export interface StepListsProps {
  checklist: ChecklistState;
}

export function StepLists({ checklist }: StepListsProps) {
  return (
    <>
      <ChecklistRows checklist={checklist} entries={checklist.toPrepare} density="compact" />
      <SuggestedSteps checklist={checklist} density="compact" />
    </>
  );
}

export interface EventStepsProps {
  event: Pick<EventItem, "id" | "category" | "checklist" | "preparation">;
}

export function EventSteps({ event }: EventStepsProps) {
  const checklist = useChecklist(event);
  if (checklist.toPrepare.length + checklist.suggested.length === 0) return null;

  return (
    <>
      <Separator />
      <StepLists checklist={checklist} />
    </>
  );
}

interface AskedQuotesProps {
  quotes: string[];
}

function AskedQuotes({ quotes }: AskedQuotesProps) {
  const { t } = useTranslation("events");
  if (quotes.length === 0) return null;

  return (
    <figure className="flex flex-col gap-1">
      <figcaption>
        <TypographyMuted>{t("prepare.quotes")}</TypographyMuted>
      </figcaption>
      {quotes.map((quote) => (
        <DeadlineQuote key={quote} dir="auto">
          {quote}
        </DeadlineQuote>
      ))}
    </figure>
  );
}

export interface PrepareChecklistProps {
  event: Pick<EventItem, "id" | "category" | "checklist" | "preparation">;
}

export function PrepareChecklist({ event }: PrepareChecklistProps) {
  const { t } = useTranslation("events");
  const titleId = useId();
  const checklist = useChecklist(event);
  const total = checklist.toPrepare.length;
  const allSet = total > 0 && checklist.doneCount === total;

  return (
    <section
      aria-labelledby={titleId}
      data-tour="event-detail-prepare"
      className="flex flex-col gap-2"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TypographyH2 id={titleId} variant="section">
          {t("prepare.title")}
        </TypographyH2>
        {total > 0 && (
          <Badge key={String(allSet)} variant={allSet ? "secondary" : "soon"}>
            {allSet && <AllDoneIcon aria-hidden />}
            {allSet
              ? t("prepare.allSet")
              : t("prepare.progress", { done: checklist.doneCount, total })}
          </Badge>
        )}
      </div>
      {total > 0 ? (
        <ChecklistRows checklist={checklist} entries={checklist.toPrepare} removable />
      ) : (
        <TypographyMuted>{t("prepare.empty")}</TypographyMuted>
      )}
      <AskedQuotes quotes={checklist.quotes} />
      <ChecklistItemForm onAdd={checklist.add} />
      <SuggestedSteps checklist={checklist} removable />
    </section>
  );
}

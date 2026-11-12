import { Badge } from "@packages/ui/components/ui/badge";
import { Checkbox } from "@packages/ui/components/ui/checkbox";
import { Checklist, ChecklistItem } from "@packages/ui/components/ui/checklist";
import { IconButton } from "@packages/ui/components/ui/icon-button";
import { Label } from "@packages/ui/components/ui/label";
import { TypographyH2, TypographyMuted } from "@packages/ui/components/ui/typography";
import { CheckCheckIcon, XIcon } from "lucide-react";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import type { EventItem } from "../../../shared/api/queries/events";
import { ChecklistItemForm } from "../forms/checklist-item-form";
import { type Checklist as ChecklistState, useChecklist } from "../hooks/use-checklist";

export interface ChecklistRowsProps {
  checklist: ChecklistState;
  removable?: boolean;
}

export function ChecklistRows({ checklist, removable = false }: ChecklistRowsProps) {
  const { t } = useTranslation("events");
  const prefix = useId();

  return (
    <Checklist>
      {checklist.items.map((item) => {
        const id = `${prefix}-${item.id}`;

        return (
          <ChecklistItem key={item.id}>
            <Checkbox
              id={id}
              checked={item.done}
              onCheckedChange={(checked) => checklist.toggle(item.id, checked === true)}
            />
            <Label htmlFor={id}>{item.label}</Label>
            {removable && (
              <IconButton
                type="button"
                variant="ghost"
                size="icon-sm"
                label={t("prepare.remove", { item: item.label })}
                onClick={() => checklist.remove(item.id)}
              >
                <XIcon aria-hidden />
              </IconButton>
            )}
          </ChecklistItem>
        );
      })}
    </Checklist>
  );
}

export interface PrepareChecklistProps {
  event: Pick<EventItem, "id" | "category" | "checklist">;
}

export function PrepareChecklist({ event }: PrepareChecklistProps) {
  const { t } = useTranslation("events");
  const titleId = useId();
  const checklist = useChecklist(event);
  const total = checklist.items.length;
  const allSet = total > 0 && checklist.doneCount === total;

  return (
    <section
      aria-labelledby={titleId}
      data-tour="event-detail-prepare"
      className="flex flex-col gap-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TypographyH2 id={titleId} variant="section">
          {t("prepare.title")}
        </TypographyH2>
        {total > 0 && (
          <Badge key={String(allSet)} variant={allSet ? "secondary" : "soon"}>
            {allSet && <CheckCheckIcon aria-hidden />}
            {allSet
              ? t("prepare.allSet")
              : t("prepare.progress", { done: checklist.doneCount, total })}
          </Badge>
        )}
      </div>
      <TypographyMuted>{total > 0 ? t("prepare.description") : t("prepare.empty")}</TypographyMuted>
      {total > 0 && <ChecklistRows checklist={checklist} removable />}
      <ChecklistItemForm onAdd={checklist.add} />
    </section>
  );
}

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@packages/ui/components/ui/dialog";
import { Skeleton, SkeletonGroup } from "@packages/ui/components/ui/skeleton";
import { Suspense } from "react";
import { useTranslation } from "react-i18next";
import type { ChildDto } from "../../../../shared/api/queries/children";
import { preloadable } from "../../../../shared/perf/preloadable";

const { Component: AddEventForm, preload: preloadAddEventForm } = preloadable(() =>
  import("../../forms/add-event-form").then((module) => module.AddEventForm),
);

export { preloadAddEventForm };

export interface AddEventDialogProps {
  date: string | null;
  family: readonly ChildDto[];
  childId: string | null;
  onClose: () => void;
}

export function AddEventDialog({ date, family, childId, onClose }: AddEventDialogProps) {
  const { t } = useTranslation("events");
  const { t: tCommon } = useTranslation("common");

  return (
    <Dialog open={date !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent closeLabel={tCommon("actions.close")}>
        <DialogHeader>
          <DialogTitle>{t("calendar.addDialog.title")}</DialogTitle>
          <DialogDescription>{t("calendar.addDialog.description")}</DialogDescription>
        </DialogHeader>
        {date && (
          <Suspense
            fallback={
              <SkeletonGroup label={t("calendar.addDialog.loading")} className="gap-4">
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
                <Skeleton className="h-24" />
              </SkeletonGroup>
            }
          >
            <AddEventForm family={family} childId={childId} date={date} onAdded={onClose} />
          </Suspense>
        )}
      </DialogContent>
    </Dialog>
  );
}

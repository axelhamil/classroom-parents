import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@packages/ui/components/ui/dialog";
import { useTranslation } from "react-i18next";
import type { ChildDto } from "../../../../shared/api/queries/children";
import { AddEventForm } from "../../forms/add-event-form";

export interface AddEventDialogProps {
  date: string | null;
  family: readonly ChildDto[];
  childId: string;
  onClose: () => void;
}

export function AddEventDialog({ date, family, childId, onClose }: AddEventDialogProps) {
  const { t } = useTranslation("events");

  return (
    <Dialog open={date !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent closeLabel={t("calendar.close")}>
        <DialogHeader>
          <DialogTitle>{t("calendar.addDialog.title")}</DialogTitle>
          <DialogDescription>{t("calendar.addDialog.description")}</DialogDescription>
        </DialogHeader>
        {date && <AddEventForm family={family} childId={childId} date={date} onAdded={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

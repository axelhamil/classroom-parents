import { Alert, AlertDescription } from "@packages/ui/components/ui/alert";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@packages/ui/components/ui/alert-dialog";
import { Button } from "@packages/ui/components/ui/button";
import { SettingsSection } from "@packages/ui/components/ui/settings-section";
import { useFormatDate, useFormatDateTime } from "@packages/web-kit/i18n/use-format-date";
import { AlertTriangleIcon, TrashIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useCancelDeletion } from "../../../shared/auth/use-cancel-deletion";
import { RequestDeletionPasswordForm } from "../forms/request-deletion-password-form";

interface RgpdDeletionCardProps {
  pendingDeletionUntil: Date | string | null | undefined;
}

export function RgpdDeletionCard({ pendingDeletionUntil }: RgpdDeletionCardProps) {
  if (pendingDeletionUntil) {
    return <PendingState until={new Date(pendingDeletionUntil)} />;
  }

  return <ActiveState />;
}

interface PendingStateProps {
  until: Date;
}

function PendingState({ until }: PendingStateProps) {
  const { t } = useTranslation("settings");
  const formatDate = useFormatDate();
  const formatDateTime = useFormatDateTime();
  const cancel = useCancelDeletion();

  return (
    <SettingsSection
      tone="destructive"
      title={t("deletion.scheduledTitle")}
      description={t("deletion.scheduledDescription", { date: formatDateTime(until) })}
    >
      <Alert variant="destructive">
        <AlertTriangleIcon />
        <AlertDescription>
          {t("deletion.anonymizedWarning", { date: formatDate(until) })}
        </AlertDescription>
      </Alert>
      <Button
        type="button"
        variant="outline"
        className="self-start"
        disabled={cancel.isPending}
        onClick={() => cancel.mutate()}
      >
        {cancel.isPending ? t("deletion.cancelling") : t("deletion.cancel")}
      </Button>
    </SettingsSection>
  );
}

function ActiveState() {
  const { t } = useTranslation("settings");

  return (
    <SettingsSection
      tone="destructive"
      title={t("deletion.title")}
      description={t("deletion.description")}
    >
      <Alert variant="destructive">
        <AlertTriangleIcon />
        <AlertDescription>{t("deletion.warning")}</AlertDescription>
      </Alert>
      <DeleteDialog />
    </SettingsSection>
  );
}

function DeleteDialog() {
  const { t } = useTranslation("settings");
  const [open, setOpen] = useState(false);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="outline" className="self-start">
          <TrashIcon />
          {t("deletion.title")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("deletion.dialogTitle")}</AlertDialogTitle>
          <AlertDialogDescription>{t("deletion.dialogDescription")}</AlertDialogDescription>
        </AlertDialogHeader>
        <RequestDeletionPasswordForm onClose={() => setOpen(false)} />
      </AlertDialogContent>
    </AlertDialog>
  );
}

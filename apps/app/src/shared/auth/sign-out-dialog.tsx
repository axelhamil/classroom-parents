import {
  DestructiveActionDialog,
  type DestructiveActionDialogOpening,
} from "@packages/ui/components/ui/destructive-action-dialog";
import { useTranslation } from "react-i18next";

export type SignOutDialogProps = DestructiveActionDialogOpening & {
  onConfirm: () => void;
  onCloseAutoFocus?: (event: Event) => void;
};

export function SignOutDialog({ onConfirm, ...dialogProps }: SignOutDialogProps) {
  const { t } = useTranslation(["settings", "common"]);

  return (
    <DestructiveActionDialog
      {...dialogProps}
      title={t("signOut.dialogTitle")}
      description={t("signOut.dialogDescription")}
      actionLabel={t("signOut.confirm")}
      actionVariant="default"
      cancelLabel={t("common:actions.cancel")}
      onConfirm={onConfirm}
    />
  );
}

import {
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogFooter,
} from "@packages/ui/components/ui/alert-dialog";
import { useTranslation } from "react-i18next";

interface DeletionConfirmFooterProps {
  isPending: boolean;
}

export function DeletionConfirmFooter({ isPending }: DeletionConfirmFooterProps) {
  const { t } = useTranslation(["settings", "common"]);

  return (
    <AlertDialogFooter>
      <AlertDialogCancel type="button">{t("common:actions.cancel")}</AlertDialogCancel>
      <AlertDialogAction type="submit" variant="destructive" disabled={isPending}>
        {isPending ? t("deletion.submitting") : t("deletion.confirm")}
      </AlertDialogAction>
    </AlertDialogFooter>
  );
}

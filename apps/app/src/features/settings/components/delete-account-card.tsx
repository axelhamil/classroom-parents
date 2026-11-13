import { Alert, AlertDescription, AlertTitle } from "@packages/ui/components/ui/alert";
import { Button } from "@packages/ui/components/ui/button";
import { DestructiveActionDialog } from "@packages/ui/components/ui/destructive-action-dialog";
import { SectionCard } from "@packages/ui/components/ui/section-card";
import { useFormatDateTime } from "@packages/web-kit/i18n/use-format-date";
import { useQuery } from "@tanstack/react-query";
import { ShieldAlert, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { sessionQueryOptions } from "../../../shared/api/queries/session";
import { useGoogleReauth } from "../../rgpd/hooks/use-google-reauth";
import { useRequestDeletion } from "../../rgpd/hooks/use-request-deletion";

const RETURN_PATH = "/settings";
const GOOGLE_CANCELLED = "access_denied";

export interface DeleteAccountCardProps {
  reauthError?: string;
}

export function DeleteAccountCard({ reauthError }: DeleteAccountCardProps) {
  const { data: session } = useQuery(sessionQueryOptions);
  const until = session?.user.pendingDeletionUntil;

  if (until) return <ScheduledDeletion until={new Date(until)} />;

  return <RequestDeletion reauthError={reauthError} />;
}

interface ScheduledDeletionProps {
  until: Date;
}

function ScheduledDeletion({ until }: ScheduledDeletionProps) {
  const { t } = useTranslation("settings");
  const formatDateTime = useFormatDateTime();

  return (
    <SectionCard
      tone="destructive"
      title={t("deletion.scheduledTitle")}
      description={t("deletion.scheduledDescription", { date: formatDateTime(until) })}
    />
  );
}

function reauthMessageKey(reauthError: string | undefined) {
  if (reauthError === undefined) return "deletion.reauth";
  if (reauthError === GOOGLE_CANCELLED) return "deletion.reauthCancelled";

  return "deletion.reauthCallbackFailed";
}

function RequestDeletion({ reauthError }: DeleteAccountCardProps) {
  const { t } = useTranslation(["settings", "common"]);
  const deletion = useRequestDeletion();
  const reauth = useGoogleReauth(RETURN_PATH);
  const reauthRequired = deletion.reauthRequired || reauthError !== undefined;

  return (
    <SectionCard
      tone="destructive"
      title={t("deletion.title")}
      description={t("deletion.description")}
    >
      {reauthRequired ? (
        <>
          <Alert>
            <ShieldAlert />
            <AlertTitle>{t("deletion.reauthTitle")}</AlertTitle>
            <AlertDescription>{t(reauthMessageKey(reauthError))}</AlertDescription>
          </Alert>
          <Button
            type="button"
            className="self-start"
            disabled={reauth.isPending}
            onClick={() => reauth.mutate()}
          >
            {reauth.isPending ? t("deletion.reauthPending") : t("deletion.reauthAction")}
          </Button>
        </>
      ) : (
        <DestructiveActionDialog
          trigger={
            <Button
              type="button"
              variant="outline"
              className="self-start"
              disabled={deletion.isPending}
            >
              <Trash2 />
              {deletion.isPending ? t("deletion.submitting") : t("deletion.action")}
            </Button>
          }
          title={t("deletion.dialogTitle")}
          description={t("deletion.dialogDescription")}
          actionLabel={t("deletion.confirm")}
          cancelLabel={t("common:actions.cancel")}
          isPending={deletion.isPending}
          onConfirm={deletion.request}
        />
      )}
    </SectionCard>
  );
}

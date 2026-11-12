import { Badge } from "@packages/ui/components/ui/badge";
import { Button } from "@packages/ui/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/ui/card";
import { DestructiveActionDialog } from "@packages/ui/components/ui/destructive-action-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@packages/ui/components/ui/dialog";
import { TypographyMuted } from "@packages/ui/components/ui/typography";
import { toastError, toastSuccess } from "@packages/web-kit/api/errors/toast";
import { useFormatDateTime } from "@packages/web-kit/i18n/use-format-date";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { type ChildDto, childrenQueryOptions } from "../../../shared/api/queries/children";
import { disconnectChildMutationOptions } from "../api/children.mutations";
import { CHILD_STATUS_BADGES, CHILD_STATUS_LABEL_KEYS } from "../child-status-labels";
import { RenameChildForm } from "../forms/rename-child-form";
import { classifySchoolError } from "../school-error";
import { ReconnectBanner } from "./reconnect-banner";
import { SchoolProcedure } from "./school-procedure";

export interface ChildCardProps {
  child: ChildDto;
}

function SyncLine({ child }: ChildCardProps) {
  const { t } = useTranslation("children");
  const formatDateTime = useFormatDateTime("medium");

  if (child.status === "disconnecting")
    return <TypographyMuted>{t("card.disconnectingHint")}</TypographyMuted>;
  if (child.syncing) return <TypographyMuted>{t("card.syncing")}</TypographyMuted>;
  if (!child.lastSyncedAt) return <TypographyMuted>{t("card.neverSynced")}</TypographyMuted>;

  return (
    <TypographyMuted>
      {t("card.lastSynced", { date: formatDateTime(child.lastSyncedAt) })}
    </TypographyMuted>
  );
}

export function ChildCard({ child }: ChildCardProps) {
  const { t } = useTranslation("children");
  const queryClient = useQueryClient();
  const [renaming, setRenaming] = useState(false);
  const disconnect = useMutation({
    ...disconnectChildMutationOptions,
    onSuccess: () => toastSuccess(t("disconnect.done", { label: child.label })),
    onError: (error) => toastError(error, t("disconnect.failed")),
    onSettled: () => queryClient.invalidateQueries({ queryKey: childrenQueryOptions.queryKey }),
  });
  const leaving = child.status === "disconnecting";

  return (
    <Card variant={child.status === "blocked_by_school" ? "destructive" : "default"}>
      <CardHeader>
        <CardTitle asChild>
          <h2 className="break-words">{child.label}</h2>
        </CardTitle>
        <CardDescription className="break-all">{child.googleEmail}</CardDescription>
        <CardAction>
          <Badge variant={CHILD_STATUS_BADGES[child.status]}>
            {t(CHILD_STATUS_LABEL_KEYS[child.status])}
          </Badge>
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <SyncLine child={child} />

        {child.status === "needs_reconnect" && (
          <ReconnectBanner
            childId={child.id}
            title={t("reconnect.needsReconnectTitle")}
            message={t("reconnect.needsReconnect")}
          />
        )}

        {child.status === "blocked_by_school" && (
          <>
            <SchoolProcedure kind={classifySchoolError(child)} />
            <ReconnectBanner
              childId={child.id}
              title={t("reconnect.afterSchoolTitle")}
              message={t("reconnect.afterSchool")}
            />
          </>
        )}
      </CardContent>

      <CardFooter className="flex flex-wrap gap-2">
        {!leaving && (
          <Dialog open={renaming} onOpenChange={setRenaming}>
            <DialogTrigger asChild>
              <Button variant="outline">{t("card.rename")}</Button>
            </DialogTrigger>
            <DialogContent closeLabel={t("rename.cancel")}>
              <DialogHeader>
                <DialogTitle>{t("rename.title")}</DialogTitle>
                <DialogDescription>{t("rename.description")}</DialogDescription>
              </DialogHeader>
              <RenameChildForm
                childId={child.id}
                label={child.label}
                onDone={() => setRenaming(false)}
              />
            </DialogContent>
          </Dialog>
        )}

        <DestructiveActionDialog
          trigger={<Button variant="ghost">{t("card.disconnect")}</Button>}
          title={t("disconnect.title", { label: child.label })}
          description={t("disconnect.description")}
          actionLabel={t("disconnect.confirm")}
          cancelLabel={t("disconnect.cancel")}
          onConfirm={() => disconnect.mutate(child.id)}
          isPending={disconnect.isPending}
        />
      </CardFooter>
    </Card>
  );
}

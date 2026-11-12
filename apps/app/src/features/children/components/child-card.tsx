import { Badge } from "@packages/ui/components/ui/badge";
import { Button } from "@packages/ui/components/ui/button";
import { Card, CardContent, CardFooter } from "@packages/ui/components/ui/card";
import { ChildAvatar } from "@packages/ui/components/ui/child-avatar";
import {
  ChildBanner,
  ChildBannerAvatar,
  ChildBannerMeta,
  ChildBannerText,
  ChildBannerTitle,
} from "@packages/ui/components/ui/child-banner";
import { DestructiveActionDialog } from "@packages/ui/components/ui/destructive-action-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@packages/ui/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@packages/ui/components/ui/dropdown-menu";
import { IconButton } from "@packages/ui/components/ui/icon-button";
import { Spinner } from "@packages/ui/components/ui/spinner";
import { TypographyMuted } from "@packages/ui/components/ui/typography";
import { toastError, toastSuccess } from "@packages/web-kit/api/errors/toast";
import { useFormatDateTime } from "@packages/web-kit/i18n/use-format-date";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CalendarDays, EllipsisVertical, PencilLine, RefreshCw, Unlink } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { type ChildDto, childrenQueryOptions } from "../../../shared/api/queries/children";
import { syncChildMutationOptions } from "../../../shared/children/child-link.mutations";
import { classifySchoolError } from "../../../shared/children/school-error";
import { SchoolProcedure } from "../../../shared/children/school-procedure";
import type { ChildHue } from "../../../shared/format/child-hue";
import { disconnectChildMutationOptions } from "../api/children.mutations";
import { CHILD_STATUS_BADGES, CHILD_STATUS_LABEL_KEYS } from "../child-status-labels";
import { RenameChildForm } from "../forms/rename-child-form";
import { ReconnectBanner } from "./reconnect-banner";

export interface ChildCardProps {
  child: ChildDto;
  hue: ChildHue;
  avatarUrl?: string | null;
}

type CardDialog = "rename" | "disconnect" | null;

interface SyncLineProps {
  child: ChildDto;
}

function SyncLine({ child }: SyncLineProps) {
  const { t } = useTranslation("children");
  const formatDateTime = useFormatDateTime("medium");

  if (child.status === "disconnecting")
    return <TypographyMuted>{t("card.disconnectingHint")}</TypographyMuted>;
  if (child.syncing) {
    return (
      <TypographyMuted aria-live="polite" className="flex items-center gap-2">
        <Spinner aria-hidden label={t("card.syncing")} />
        {t("card.syncing")}
      </TypographyMuted>
    );
  }
  if (!child.lastSyncedAt) return <TypographyMuted>{t("card.neverSynced")}</TypographyMuted>;

  return (
    <TypographyMuted>
      {t("card.lastSynced", { date: formatDateTime(child.lastSyncedAt) })}
    </TypographyMuted>
  );
}

export function ChildCard({ child, hue, avatarUrl }: ChildCardProps) {
  const { t } = useTranslation("children");
  const queryClient = useQueryClient();
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const [dialog, setDialog] = useState<CardDialog>(null);
  const invalidateChildren = () =>
    queryClient.invalidateQueries({ queryKey: childrenQueryOptions.queryKey });
  const sync = useMutation({
    ...syncChildMutationOptions,
    onSuccess: () => toastSuccess(t("sync.started", { label: child.label })),
    onError: (error) => toastError(error, t("sync.failed")),
  });
  const disconnect = useMutation({
    ...disconnectChildMutationOptions,
    onSuccess: () => toastSuccess(t("disconnect.done", { label: child.label })),
    onError: (error) => toastError(error, t("disconnect.failed")),
    onSettled: invalidateChildren,
  });
  const leaving = child.status === "disconnecting";
  const connected = child.status === "connected";
  const closeDialog = (open: boolean) => {
    if (!open) setDialog(null);
  };
  const returnFocus = (event: Event) => {
    event.preventDefault();
    menuTrigger.current?.focus();
  };

  return (
    <Card flush variant={child.status === "blocked_by_school" ? "destructive" : "default"}>
      <ChildBanner hue={hue}>
        <ChildBannerText>
          <ChildBannerTitle>{child.label}</ChildBannerTitle>
          <ChildBannerMeta title={child.googleEmail}>{child.googleEmail}</ChildBannerMeta>
        </ChildBannerText>

        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <IconButton
              ref={menuTrigger}
              variant="overlay"
              label={t("card.actions", { label: child.label })}
            >
              <EllipsisVertical aria-hidden />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {!leaving && (
              <DropdownMenuItem onSelect={() => setDialog("rename")}>
                <PencilLine aria-hidden />
                {t("card.rename")}
              </DropdownMenuItem>
            )}
            {connected && (
              <DropdownMenuItem
                disabled={child.syncing || sync.isPending}
                onSelect={() => sync.mutate(child.id)}
              >
                <RefreshCw aria-hidden />
                {t("card.sync")}
              </DropdownMenuItem>
            )}
            {!leaving && <DropdownMenuSeparator />}
            <DropdownMenuItem variant="destructive" onSelect={() => setDialog("disconnect")}>
              <Unlink aria-hidden />
              {t("card.disconnect")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <ChildBannerAvatar>
          <ChildAvatar name={child.label} tone={hue} src={avatarUrl} size="lg" />
        </ChildBannerAvatar>
      </ChildBanner>

      <CardContent className="flex flex-col gap-4 pt-4">
        <div className="flex flex-col items-start gap-2 pr-20">
          <Badge variant={CHILD_STATUS_BADGES[child.status]}>
            {t(CHILD_STATUS_LABEL_KEYS[child.status])}
          </Badge>
          <SyncLine child={child} />
        </div>

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

      {connected && (
        <CardFooter className="pt-4">
          <Button asChild variant="secondary" size="sm">
            <Link to="/" search={{ childId: child.id }}>
              <CalendarDays aria-hidden />
              {t("card.toEvents")}
            </Link>
          </Button>
        </CardFooter>
      )}

      <Dialog open={dialog === "rename"} onOpenChange={closeDialog}>
        <DialogContent closeLabel={t("rename.cancel")} onCloseAutoFocus={returnFocus}>
          <DialogHeader>
            <DialogTitle>{t("rename.title")}</DialogTitle>
            <DialogDescription>{t("rename.description")}</DialogDescription>
          </DialogHeader>
          <RenameChildForm childId={child.id} label={child.label} onDone={() => setDialog(null)} />
        </DialogContent>
      </Dialog>

      <DestructiveActionDialog
        open={dialog === "disconnect"}
        onOpenChange={closeDialog}
        onCloseAutoFocus={returnFocus}
        title={t("disconnect.title", { label: child.label })}
        description={t("disconnect.description")}
        actionLabel={t("disconnect.confirm")}
        cancelLabel={t("disconnect.cancel")}
        onConfirm={() => disconnect.mutate(child.id)}
        isPending={disconnect.isPending}
      />
    </Card>
  );
}

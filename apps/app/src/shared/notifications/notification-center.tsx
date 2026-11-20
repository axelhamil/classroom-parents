import { Button } from "@packages/ui/components/ui/button";
import { NotificationsIcon } from "@packages/ui/components/ui/icons";
import {
  Popover,
  PopoverBody,
  PopoverContent,
  PopoverHeader,
  PopoverTrigger,
} from "@packages/ui/components/ui/popover";
import { TypographyH2 } from "@packages/ui/components/ui/typography";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useId } from "react";
import { useTranslation } from "react-i18next";
import { childrenQueryOptions } from "../api/queries/children";
import { BoardEmpty } from "../events/event-board";
import { ResponsiveOverlay } from "../layout/responsive-overlay";
import { QueryState } from "../query/query-state";
import { NotificationList, NotificationListSkeleton } from "./notification-list";
import {
  markAllNotificationsReadMutationOptions,
  markNotificationReadMutationOptions,
} from "./notifications.mutations";
import {
  NOTIFICATIONS_KEY,
  type NotificationItem,
  notificationPagesQueryOptions,
  unreadCountQueryOptions,
} from "./notifications.queries";

function useRefreshNotifications(): () => Promise<void> {
  const queryClient = useQueryClient();

  return () => queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
}

export interface NotificationFeedProps {
  onClose: () => void;
}

export function NotificationFeed({ onClose }: NotificationFeedProps) {
  const { t } = useTranslation("notifications");
  const refresh = useRefreshNotifications();
  const feed = useInfiniteQuery(notificationPagesQueryOptions);
  const unread = useQuery(unreadCountQueryOptions).data ?? 0;
  const family = useQuery(childrenQueryOptions).data ?? [];
  const markAll = useMutation({ ...markAllNotificationsReadMutationOptions, onSettled: refresh });
  const markRead = useMutation({ ...markNotificationReadMutationOptions, onSettled: refresh });

  const open = (notification: NotificationItem) => {
    if (notification.readAt === null) markRead.mutate(notification.id);
    onClose();
  };

  return (
    <>
      {unread > 0 && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          disabled={markAll.isPending}
          onClick={() => markAll.mutate()}
        >
          {t("markAllRead")}
        </Button>
      )}
      <QueryState
        query={feed}
        skeleton={<NotificationListSkeleton label={t("loading")} />}
        empty={
          <BoardEmpty
            icon={NotificationsIcon}
            title={t("empty.title")}
            description={t("empty.description")}
          />
        }
        isEmpty={(data) => data.pages.every((page) => page.notifications.length === 0)}
      >
        {(data) => (
          <>
            <NotificationList
              notifications={data.pages.flatMap((page) => page.notifications)}
              family={family}
              onOpen={open}
            />
            {feed.hasNextPage && (
              <Button
                type="button"
                variant="outline"
                disabled={feed.isFetchingNextPage}
                onClick={() => void feed.fetchNextPage()}
              >
                {t("more")}
              </Button>
            )}
          </>
        )}
      </QueryState>
    </>
  );
}

export interface NotificationDrawerProps {
  returnFocus: () => readonly HTMLElement[];
  onClose: () => void;
}

export function NotificationDrawer({ returnFocus, onClose }: NotificationDrawerProps) {
  const { t } = useTranslation("notifications");

  return (
    <ResponsiveOverlay
      docked="sheet"
      title={t("title")}
      description={t("description")}
      descriptionHidden
      returnFocus={returnFocus}
      onClose={onClose}
    >
      <NotificationFeed onClose={onClose} />
    </ResponsiveOverlay>
  );
}

export interface NotificationPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactNode;
}

export function NotificationPopover({ open, onOpenChange, trigger }: NotificationPopoverProps) {
  const { t } = useTranslation("notifications");
  const titleId = useId();

  return (
    <Popover modal open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        size="panel"
        align="end"
        aria-labelledby={titleId}
        className="flex max-h-[min(40rem,var(--radix-popover-content-available-height))] flex-col"
      >
        <PopoverHeader className="px-4 pt-4">
          <TypographyH2 id={titleId}>{t("title")}</TypographyH2>
        </PopoverHeader>
        <PopoverBody>
          <NotificationFeed onClose={() => onOpenChange(false)} />
        </PopoverBody>
      </PopoverContent>
    </Popover>
  );
}

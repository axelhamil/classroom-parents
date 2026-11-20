import { ChildAvatar } from "@packages/ui/components/ui/child-avatar";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@packages/ui/components/ui/item";
import { Skeleton, SkeletonGroup } from "@packages/ui/components/ui/skeleton";
import { TypographyH3 } from "@packages/ui/components/ui/typography";
import { UnreadDot } from "@packages/ui/components/ui/unread-mark";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { ChildDto } from "../api/queries/children";
import { childAvatarSrc } from "../children/child-avatar-src";
import { childHue } from "../format/child-hue";
import { groupByDay, notificationDayLabel, notificationTimeLabel } from "./notification-days";
import { notificationView } from "./notification-view";
import type { NotificationItem } from "./notifications.queries";

const SKELETON_ROWS = [0, 1, 2, 3];

export interface NotificationListSkeletonProps {
  label: string;
}

export function NotificationListSkeleton({ label }: NotificationListSkeletonProps) {
  return (
    <SkeletonGroup label={label} className="gap-5">
      {SKELETON_ROWS.map((row) => (
        <div key={row} className="flex items-center gap-3">
          <Skeleton shape="circle" className="size-8" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton shape="line" className="w-4/5" />
            <Skeleton shape="line" className="w-1/4" />
          </div>
        </div>
      ))}
    </SkeletonGroup>
  );
}

interface NotificationRowProps {
  notification: NotificationItem;
  child: ChildDto | undefined;
  hue: ReturnType<typeof childHue>;
  onOpen: (notification: NotificationItem) => void;
}

function NotificationRow({ notification, child, hue, onOpen }: NotificationRowProps) {
  const { t } = useTranslation("notifications");
  const { copy, target, icon: Icon } = notificationView(notification, child?.label ?? null);
  const unread = notification.readAt === null;

  return (
    <li>
      <Item asChild size="sm">
        <Link {...target} onClick={() => onOpen(notification)}>
          <ItemMedia variant={child ? "default" : "icon"}>
            {child ? (
              <ChildAvatar name={child.label} tone={hue} src={childAvatarSrc(child)} size="sm" />
            ) : (
              <Icon aria-hidden />
            )}
          </ItemMedia>
          <ItemContent>
            <ItemTitle>{t(copy.key, copy.values)}</ItemTitle>
            <ItemDescription className="flex items-center gap-2 tabular-nums">
              {child && <Icon aria-hidden className="size-4" />}
              {notificationTimeLabel(notification.createdAt)}
            </ItemDescription>
          </ItemContent>
          {unread && (
            <ItemActions>
              <UnreadDot />
              <span className="sr-only">{t("unread")}</span>
            </ItemActions>
          )}
        </Link>
      </Item>
    </li>
  );
}

export interface NotificationListProps {
  notifications: readonly NotificationItem[];
  family: readonly ChildDto[];
  now: Date;
  onOpen: (notification: NotificationItem) => void;
}

export function NotificationList({ notifications, family, now, onOpen }: NotificationListProps) {
  const { t } = useTranslation("notifications");
  const labels = { today: t("days.today"), yesterday: t("days.yesterday") };

  return groupByDay(notifications).map((day) => (
    <section key={day.date} aria-labelledby={`notifications-${day.date}`} className="flex flex-col">
      <TypographyH3 id={`notifications-${day.date}`}>
        {notificationDayLabel(day.date, now, labels)}
      </TypographyH3>
      <ul className="flex flex-col">
        {day.items.map((notification) => (
          <NotificationRow
            key={notification.id}
            notification={notification}
            child={family.find((child) => child.id === notification.childId)}
            hue={notification.childId ? childHue(family, notification.childId) : 1}
            onOpen={onOpen}
          />
        ))}
      </ul>
    </section>
  ));
}

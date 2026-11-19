import { IconButton } from "@packages/ui/components/ui/icon-button";
import { UnreadCount } from "@packages/ui/components/ui/unread-mark";
import { useQuery } from "@tanstack/react-query";
import { BellIcon } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { TABLET_QUERY, useMediaQuery } from "../layout/use-media-query";
import { NotificationDrawer, NotificationPopover } from "./notification-center";
import { unreadCountQueryOptions } from "./notifications.queries";

const MAX_SHOWN_COUNT = 9;

interface Arrivals {
  seen: number | undefined;
  count: number;
}

function useArrivals(unread: number | undefined): number {
  const [arrivals, setArrivals] = useState<Arrivals>({ seen: unread, count: 0 });
  if (unread === arrivals.seen) return arrivals.count;

  const arrived = arrivals.seen !== undefined && unread !== undefined && unread > arrivals.seen;
  setArrivals({ seen: unread, count: arrived ? arrivals.count + 1 : arrivals.count });

  return arrivals.count;
}

export function NotificationBell() {
  const { t } = useTranslation("notifications");
  const unread = useQuery(unreadCountQueryOptions).data;
  const arrivals = useArrivals(unread);
  const [open, setOpen] = useState(false);
  const bellRef = useRef<HTMLButtonElement>(null);
  const docked = useMediaQuery(TABLET_QUERY);
  const count = unread ?? 0;
  const shownCount =
    count > MAX_SHOWN_COUNT ? t("bell.overflow", { max: MAX_SHOWN_COUNT }) : String(count);

  const bell = (
    <IconButton
      ref={bellRef}
      type="button"
      variant="ghost"
      size="icon-lg"
      label={t("bell.label")}
      accessibleName={count > 0 ? t("bell.withUnread", { count }) : undefined}
      aria-haspopup="dialog"
      className="relative"
      onClick={docked ? undefined : () => setOpen(true)}
    >
      <BellIcon aria-hidden />
      {count > 0 && <UnreadCount>{shownCount}</UnreadCount>}
    </IconButton>
  );

  return (
    <>
      {docked ? <NotificationPopover open={open} onOpenChange={setOpen} trigger={bell} /> : bell}
      <p role="status" aria-live="polite" className="sr-only">
        {arrivals > 0 ? t("announce") : ""}
      </p>
      {open && !docked && (
        <NotificationDrawer
          returnFocus={() => (bellRef.current ? [bellRef.current] : [])}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

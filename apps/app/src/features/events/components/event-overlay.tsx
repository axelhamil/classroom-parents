import { Button } from "@packages/ui/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@packages/ui/components/ui/drawer";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@packages/ui/components/ui/sheet";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { TABLET_QUERY, useMediaQuery } from "../../../shared/layout/use-media-query";
import { QueryState } from "../../../shared/query/query-state";
import { eventQueryOptions } from "../api/events.queries";
import { EventDetailBody, EventDetailSkeleton } from "./event-detail-body";

export interface EventOverlayProps {
  eventId: string;
  onClose: () => void;
}

export function EventOverlay({ eventId, onClose }: EventOverlayProps) {
  const { t } = useTranslation("events");
  const tablet = useMediaQuery(TABLET_QUERY);
  const query = useQuery(eventQueryOptions(eventId));
  const title = query.data?.title ?? t("detail.title");
  const body = (
    <QueryState query={query} skeleton={<EventDetailSkeleton />}>
      {(event) => <EventDetailBody event={event} onDeleted={onClose} />}
    </QueryState>
  );
  const onOpenChange = (open: boolean) => {
    if (!open) onClose();
  };

  return tablet ? (
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent size="lg" closeLabel={t("detail.close")}>
        <SheetHeader>
          <SheetTitle className="pr-8 wrap-anywhere">{title}</SheetTitle>
          <SheetDescription className="sr-only">{t("detail.title")}</SheetDescription>
        </SheetHeader>
        <SheetBody className="gap-6">{body}</SheetBody>
      </SheetContent>
    </Sheet>
  ) : (
    <Drawer open onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle className="wrap-anywhere">{title}</DrawerTitle>
          <DrawerDescription className="sr-only">{t("detail.title")}</DrawerDescription>
        </DrawerHeader>
        <div className="flex min-h-0 flex-col gap-6 overflow-y-auto px-4">{body}</div>
        <DrawerFooter>
          <DrawerClose asChild>
            <Button type="button" variant="outline">
              {t("detail.close")}
            </Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

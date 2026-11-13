import { Button } from "@packages/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@packages/ui/components/ui/dialog";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@packages/ui/components/ui/drawer";
import { Item, ItemActions, ItemContent, ItemTitle } from "@packages/ui/components/ui/item";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@packages/ui/components/ui/sheet";
import { createContext, type ReactNode, useContext, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { TABLET_QUERY, useMediaQuery } from "./use-media-query";

export interface UndoOffer {
  id: string;
  message: string;
  label: string;
  undo: () => void;
}

export interface UndoChannel {
  offer: (offer: UndoOffer) => void;
  withdraw: (id: string) => void;
}

const OverlayUndoContext = createContext<UndoChannel | null>(null);

const TOAST_UNDO: UndoChannel = {
  offer: ({ id, message, label, undo }) => toast(message, { id, action: { label, onClick: undo } }),
  withdraw: (id) => toast.dismiss(id),
};

export function useUndoChannel(): UndoChannel {
  return useContext(OverlayUndoContext) ?? TOAST_UNDO;
}

function focusFirstConnected(event: Event, targets: readonly HTMLElement[]): void {
  const target = targets.find((element) => element.isConnected);
  if (!target) return;

  event.preventDefault();
  if (target.tabIndex < 0 && !target.hasAttribute("tabindex")) target.tabIndex = -1;
  target.focus();
}

function pageHeading(): HTMLElement[] {
  const heading = document.querySelector<HTMLElement>("main h1");

  return heading ? [heading] : [];
}

export interface ResponsiveOverlayProps {
  title: ReactNode;
  description: ReactNode;
  descriptionHidden?: boolean;
  docked: "sheet" | "dialog";
  returnFocus: () => readonly HTMLElement[];
  onClose: () => void;
  children: ReactNode;
}

interface UndoStatusProps {
  offer: UndoOffer | null;
  onUndo: () => void;
}

function UndoStatus({ offer, onUndo }: UndoStatusProps) {
  return (
    <div role="status" className="contents">
      {offer && (
        <Item variant="muted" size="sm" className="max-md:mx-4">
          <ItemContent>
            <ItemTitle>{offer.message}</ItemTitle>
          </ItemContent>
          <ItemActions>
            <Button type="button" size="sm" variant="outline" onClick={onUndo}>
              {offer.label}
            </Button>
          </ItemActions>
        </Item>
      )}
    </div>
  );
}

interface OverlayFrameProps extends Omit<ResponsiveOverlayProps, "returnFocus" | "onClose"> {
  closeLabel: string;
  status: ReactNode;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus: (event: Event) => void;
}

function OverlayFrame({
  title,
  description,
  descriptionHidden = false,
  closeLabel,
  docked,
  status,
  onOpenChange,
  onCloseAutoFocus,
  children,
}: OverlayFrameProps) {
  const tablet = useMediaQuery(TABLET_QUERY);
  const descriptionClass = descriptionHidden ? "sr-only" : undefined;

  if (!tablet)
    return (
      <Drawer open autoFocus onOpenChange={onOpenChange}>
        <DrawerContent onCloseAutoFocus={onCloseAutoFocus}>
          <DrawerHeader>
            <DrawerTitle className="wrap-anywhere">{title}</DrawerTitle>
            <DrawerDescription className={descriptionClass}>{description}</DrawerDescription>
          </DrawerHeader>
          <div className="flex min-h-0 flex-col gap-6 overflow-y-auto px-4">{children}</div>
          {status}
          <DrawerFooter>
            <DrawerClose asChild>
              <Button type="button" variant="outline">
                {closeLabel}
              </Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    );

  if (docked === "sheet")
    return (
      <Sheet open onOpenChange={onOpenChange}>
        <SheetContent size="lg" closeLabel={closeLabel} onCloseAutoFocus={onCloseAutoFocus}>
          <SheetHeader>
            <SheetTitle className="pr-8 wrap-anywhere">{title}</SheetTitle>
            <SheetDescription className={descriptionClass}>{description}</SheetDescription>
          </SheetHeader>
          <SheetBody className="gap-6">
            {children}
            {status}
          </SheetBody>
        </SheetContent>
      </Sheet>
    );

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent
        closeLabel={closeLabel}
        onCloseAutoFocus={onCloseAutoFocus}
        className="flex flex-col"
      >
        <DialogHeader>
          <DialogTitle className="wrap-anywhere">{title}</DialogTitle>
          <DialogDescription className={descriptionClass}>{description}</DialogDescription>
        </DialogHeader>
        {children}
        {status}
      </DialogContent>
    </Dialog>
  );
}

export function ResponsiveOverlay({ returnFocus, onClose, ...frame }: ResponsiveOverlayProps) {
  const { t } = useTranslation("common");
  const [offer, setOffer] = useState<UndoOffer | null>(null);
  const [channel] = useState<UndoChannel>(() => ({
    offer: setOffer,
    withdraw: (id) => setOffer((current) => (current?.id === id ? null : current)),
  }));
  const onOpenChange = (open: boolean) => {
    if (!open) onClose();
  };
  const onCloseAutoFocus = (event: Event) =>
    focusFirstConnected(event, [...returnFocus(), ...pageHeading()]);
  const undo = () => {
    offer?.undo();
    setOffer(null);
  };

  return (
    <OverlayUndoContext value={channel}>
      <OverlayFrame
        {...frame}
        closeLabel={t("actions.close")}
        status={<UndoStatus offer={offer} onUndo={undo} />}
        onOpenChange={onOpenChange}
        onCloseAutoFocus={onCloseAutoFocus}
      />
    </OverlayUndoContext>
  );
}

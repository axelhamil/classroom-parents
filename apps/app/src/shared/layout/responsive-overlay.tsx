import { Button } from "@packages/ui/components/ui/button";
import { Item, ItemActions, ItemContent, ItemTitle } from "@packages/ui/components/ui/item";
import { createContext, type ReactNode, Suspense, useContext, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { preloadable } from "../perf/preloadable";

const { Component: OverlayFrame, preload: preloadOverlayFrame } = preloadable(() =>
  import("./overlay-frame").then((module) => module.OverlayFrame),
);

export { preloadOverlayFrame };

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
  eyebrow?: ReactNode;
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

export function ResponsiveOverlay({ returnFocus, onClose, ...frame }: ResponsiveOverlayProps) {
  const { t } = useTranslation("common");
  const [open, setOpen] = useState(true);
  const closing = useRef(false);
  const [offer, setOffer] = useState<UndoOffer | null>(null);
  const [channel] = useState<UndoChannel>(() => ({
    offer: setOffer,
    withdraw: (id) => setOffer((current) => (current?.id === id ? null : current)),
  }));
  const onOpenChange = (next: boolean) => {
    if (next) return;

    closing.current = true;
    setOpen(false);
  };
  const onCloseAutoFocus = (event: Event) => {
    focusFirstConnected(event, [...returnFocus(), ...pageHeading()]);
    if (closing.current) onClose();
  };
  const undo = () => {
    offer?.undo();
    setOffer(null);
  };

  return (
    <OverlayUndoContext value={channel}>
      <Suspense fallback={null}>
        <OverlayFrame
          {...frame}
          open={open}
          closeLabel={t("actions.close")}
          status={<UndoStatus offer={offer} onUndo={undo} />}
          onOpenChange={onOpenChange}
          onCloseAutoFocus={onCloseAutoFocus}
        />
      </Suspense>
    </OverlayUndoContext>
  );
}

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
  DrawerBody,
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
import type { ReactNode } from "react";
import type { ResponsiveOverlayProps } from "./responsive-overlay";
import { TABLET_QUERY, useMediaQuery } from "./use-media-query";

export interface OverlayFrameProps extends Omit<ResponsiveOverlayProps, "returnFocus" | "onClose"> {
  open: boolean;
  closeLabel: string;
  status: ReactNode;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus: (event: Event) => void;
}

export function OverlayFrame({
  eyebrow,
  title,
  description,
  descriptionHidden = false,
  open,
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
      <Drawer open={open} autoFocus onOpenChange={onOpenChange}>
        <DrawerContent onCloseAutoFocus={onCloseAutoFocus}>
          <DrawerHeader>
            {eyebrow}
            <DrawerTitle className="wrap-anywhere">{title}</DrawerTitle>
            <DrawerDescription className={descriptionClass}>{description}</DrawerDescription>
          </DrawerHeader>
          <DrawerBody className="gap-6">{children}</DrawerBody>
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
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent size="lg" closeLabel={closeLabel} onCloseAutoFocus={onCloseAutoFocus}>
          <SheetHeader>
            {eyebrow}
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        closeLabel={closeLabel}
        onCloseAutoFocus={onCloseAutoFocus}
        className="flex flex-col"
      >
        <DialogHeader>
          {eyebrow}
          <DialogTitle className="wrap-anywhere">{title}</DialogTitle>
          <DialogDescription className={descriptionClass}>{description}</DialogDescription>
        </DialogHeader>
        {children}
        {status}
      </DialogContent>
    </Dialog>
  );
}

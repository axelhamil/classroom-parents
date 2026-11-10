import type { MouseEvent, ReactNode } from "react";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./alert-dialog";
import { Input } from "./input";
import { Label } from "./label";

/**
 * Typing `confirmText` to unlock the action needs a label that names it;
 * the caller writes it in the reader's language, the primitive holds no copy.
 */
type TypedConfirmation =
  | { confirmText: string; confirmTextLabel: ReactNode }
  | { confirmText?: never; confirmTextLabel?: never };

/**
 * Opened by its own trigger, or by the caller (a navigation blocker) through
 * `open` and `onOpenChange`.
 */
type Opening =
  | { trigger: ReactNode; open?: never; onOpenChange?: never }
  | { trigger?: never; open: boolean; onOpenChange: (open: boolean) => void };

type DestructiveActionDialogProps = TypedConfirmation &
  Opening & {
    title: string;
    description: ReactNode;
    actionLabel: string;
    cancelLabel: string;
    onConfirm: () => void;
    isPending?: boolean;
    actionVariant?: "default" | "destructive";
  };

export function DestructiveActionDialog({
  trigger,
  title,
  description,
  actionLabel,
  cancelLabel,
  onConfirm,
  isPending = false,
  actionVariant = "destructive",
  confirmText,
  confirmTextLabel,
  open: controlledOpen,
  onOpenChange,
}: DestructiveActionDialogProps) {
  const [ownOpen, setOwnOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const open = controlledOpen ?? ownOpen;

  const requiresTyping = Boolean(confirmText);
  const matched = !requiresTyping || typed === confirmText;

  const handleOpenChange = (next: boolean) => {
    setOwnOpen(next);
    onOpenChange?.(next);
    if (!next) setTyped("");
  };

  const handleConfirm = (e: MouseEvent) => {
    if (!matched) {
      e.preventDefault();
      return;
    }
    onConfirm();
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      {trigger && <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {requiresTyping && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="destructive-confirm-input">{confirmTextLabel}</Label>
            <Input
              id="destructive-confirm-input"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
            />
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            variant={actionVariant}
            disabled={!matched || isPending}
            onClick={handleConfirm}
          >
            {actionLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

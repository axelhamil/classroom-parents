import { Hint } from "@packages/ui/components/ui/hint";
import { IconButton } from "@packages/ui/components/ui/icon-button";
import {
  DragHandleIcon,
  HideIcon,
  type Icon,
  MoveDownIcon,
  MoveUpIcon,
  NarrowIcon,
  ShorterIcon,
  TallerIcon,
  WidenIcon,
} from "@packages/ui/components/ui/icons";
import type { Ref } from "react";
import { useTranslation } from "react-i18next";
import type { BlockAxis, BlockStep } from "./dashboard-layout";

export interface TileControlsProps {
  title: string;
  handleRef: Ref<HTMLButtonElement>;
  canMove: Record<BlockStep, boolean>;
  canResize: Record<BlockAxis, Record<BlockStep, boolean>>;
  onMove: (step: BlockStep) => void;
  onResize: (axis: BlockAxis, step: BlockStep) => void;
  onHide: () => void;
}

interface ControlProps {
  icon: Icon;
  label: string;
  blocked: string | undefined;
  onClick: () => void;
}

function Control({ icon: Icon, label, blocked, onClick }: ControlProps) {
  return (
    <Hint text={blocked} showOnTouch={false}>
      <IconButton
        type="button"
        variant="ghost"
        size="icon-sm"
        label={label}
        disabled={blocked !== undefined}
        onClick={onClick}
      >
        <Icon aria-hidden />
      </IconButton>
    </Hint>
  );
}

export function TileControls({
  title,
  handleRef,
  canMove,
  canResize,
  onMove,
  onResize,
  onHide,
}: TileControlsProps) {
  const { t } = useTranslation("home");
  const block = { block: title };
  const unless = (allowed: boolean, reason: string) => (allowed ? undefined : reason);

  return (
    <>
      <IconButton
        ref={handleRef}
        type="button"
        variant="outline"
        size="icon-sm"
        label={t("edit.move", block)}
        className="cursor-grab touch-none"
      >
        <DragHandleIcon aria-hidden />
      </IconButton>
      <div className="flex gap-1 md:hidden">
        <Control
          icon={MoveUpIcon}
          label={t("edit.moveUp", block)}
          blocked={unless(canMove[-1], t("edit.first"))}
          onClick={() => onMove(-1)}
        />
        <Control
          icon={MoveDownIcon}
          label={t("edit.moveDown", block)}
          blocked={unless(canMove[1], t("edit.last"))}
          onClick={() => onMove(1)}
        />
      </div>
      <div className="hidden gap-1 md:flex">
        <Control
          icon={WidenIcon}
          label={t("edit.widen", block)}
          blocked={unless(canResize.w[1], t("edit.widest"))}
          onClick={() => onResize("w", 1)}
        />
        <Control
          icon={NarrowIcon}
          label={t("edit.narrow", block)}
          blocked={unless(canResize.w[-1], t("edit.narrowest"))}
          onClick={() => onResize("w", -1)}
        />
        <Control
          icon={TallerIcon}
          label={t("edit.taller", block)}
          blocked={unless(canResize.h[1], t("edit.tallest"))}
          onClick={() => onResize("h", 1)}
        />
        <Control
          icon={ShorterIcon}
          label={t("edit.shorter", block)}
          blocked={unless(canResize.h[-1], t("edit.shortest"))}
          onClick={() => onResize("h", -1)}
        />
      </div>
      <IconButton
        type="button"
        variant="ghost"
        size="icon-sm"
        label={t("edit.hide", block)}
        className="ms-auto"
        onClick={onHide}
      >
        <HideIcon aria-hidden />
      </IconButton>
    </>
  );
}

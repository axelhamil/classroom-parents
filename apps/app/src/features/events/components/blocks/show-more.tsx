import { Button } from "@packages/ui/components/ui/button";
import { ShowLessIcon, ShowMoreIcon } from "@packages/ui/components/ui/icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";

const ITEMS_PER_ROW = 2;

export interface ShowMore {
  open: boolean;
  rest: number;
  toggle: () => void;
}

/** The first items a block of `rows` steps holds, and the toggle to the rest. */
export function useShowMore<Item>(
  items: readonly Item[],
  rows: number,
): { shown: readonly Item[]; more: ShowMore | null } {
  const [open, setOpen] = useState(false);
  const limit = rows * ITEMS_PER_ROW;
  const rest = items.length - limit;
  if (rest <= 0) return { shown: items, more: null };

  return {
    shown: open ? items : items.slice(0, limit),
    more: { open, rest, toggle: () => setOpen(!open) },
  };
}

export interface ShowMoreButtonProps {
  more: ShowMore | null;
  controls: string;
}

export function ShowMoreButton({ more, controls }: ShowMoreButtonProps) {
  const { t } = useTranslation("home");
  if (!more) return null;

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="self-start"
      aria-expanded={more.open}
      aria-controls={controls}
      onClick={more.toggle}
    >
      {more.open ? <ShowLessIcon aria-hidden /> : <ShowMoreIcon aria-hidden />}
      {more.open ? t("blocks.less") : t("blocks.more", { count: more.rest })}
    </Button>
  );
}

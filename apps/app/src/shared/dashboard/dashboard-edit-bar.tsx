import { Button } from "@packages/ui/components/ui/button";
import { DestructiveActionDialog } from "@packages/ui/components/ui/destructive-action-dialog";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@packages/ui/components/ui/item";
import { TypographyMuted } from "@packages/ui/components/ui/typography";
import { PlusIcon, RotateCcwIcon, Undo2Icon } from "lucide-react";
import { type RefObject, useState } from "react";
import { useTranslation } from "react-i18next";
import { ResponsiveOverlay } from "../layout/responsive-overlay";
import type { DashboardBlock } from "./dashboard-block";

export interface DashboardEditBarProps {
  addButton: RefObject<HTMLButtonElement | null>;
  hidden: readonly Pick<DashboardBlock<unknown>, "id" | "title" | "description" | "icon">[];
  onShow: (id: string) => void;
  onReset: () => void;
  onUndo: () => void;
}

export function DashboardEditBar({
  addButton,
  hidden,
  onShow,
  onReset,
  onUndo,
}: DashboardEditBarProps) {
  const { t } = useTranslation("home");
  const [adding, setAdding] = useState(false);

  const add = (id: string) => {
    onShow(id);
    setAdding(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        ref={addButton}
        type="button"
        variant="outline"
        aria-haspopup="dialog"
        onClick={() => setAdding(true)}
      >
        <PlusIcon aria-hidden />
        {t("edit.add")}
      </Button>
      <Button type="button" variant="ghost" onClick={onUndo}>
        <Undo2Icon aria-hidden />
        {t("edit.undo")}
      </Button>
      <DestructiveActionDialog
        trigger={
          <Button type="button" variant="ghost">
            <RotateCcwIcon aria-hidden />
            {t("edit.reset")}
          </Button>
        }
        title={t("edit.resetTitle")}
        description={t("edit.resetDescription")}
        actionLabel={t("edit.resetConfirm")}
        actionVariant="default"
        cancelLabel={t("edit.cancel")}
        onConfirm={onReset}
      />
      {adding && (
        <ResponsiveOverlay
          docked="sheet"
          title={t("drawer.title")}
          description={t("drawer.description")}
          returnFocus={() => (addButton.current ? [addButton.current] : [])}
          onClose={() => setAdding(false)}
        >
          {hidden.length === 0 ? (
            <TypographyMuted>{t("drawer.empty")}</TypographyMuted>
          ) : (
            <ul className="flex flex-col gap-2">
              {hidden.map(({ id, title, description, icon: Icon }) => (
                <Item key={id} asChild variant="outline" size="sm">
                  <li>
                    <ItemMedia variant="icon">
                      <Icon aria-hidden />
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle>{title}</ItemTitle>
                      <ItemDescription>{description}</ItemDescription>
                    </ItemContent>
                    <ItemActions>
                      <Button
                        type="button"
                        size="sm"
                        aria-label={t("drawer.add", { block: title })}
                        onClick={() => add(id)}
                      >
                        <PlusIcon aria-hidden />
                        {t("drawer.addShort")}
                      </Button>
                    </ItemActions>
                  </li>
                </Item>
              ))}
            </ul>
          )}
        </ResponsiveOverlay>
      )}
    </div>
  );
}

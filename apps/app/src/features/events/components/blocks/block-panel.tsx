import { Badge } from "@packages/ui/components/ui/badge";
import {
  DashboardPanel,
  DashboardPanelBody,
  DashboardPanelFooter,
  DashboardPanelHeader,
  DashboardPanelNote,
  DashboardPanelTitle,
  DashboardTileToolbar,
} from "@packages/ui/components/ui/dashboard";
import type { Icon } from "@packages/ui/components/ui/icons";
import { ScrollRegion } from "@packages/ui/components/ui/scroll-region";
import { type ReactElement, type ReactNode, useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { type TileFrame, useTileFrame } from "../../../../shared/dashboard/tile-frame";

export interface BlockPanelProps {
  title: string;
  label?: string;
  count?: number;
  icon: Icon;
  note?: ReactNode;
  fit?: "card" | "natural";
  startAt?: string;
  jump?: string;
  hero?: boolean;
  fits?: boolean;
  children?: ReactNode;
}

export function BlockPanel({
  title,
  label,
  count,
  icon: Icon,
  note,
  fit,
  startAt,
  jump,
  hero,
  fits = false,
  children,
}: BlockPanelProps) {
  const { t } = useTranslation("home");
  const titleId = useId();
  const frame = useTileFrame();
  const Header = frame.editing ? DashboardTileToolbar : DashboardPanelHeader;

  return (
    <DashboardPanel
      aria-label={label}
      aria-labelledby={label ? undefined : titleId}
      fit={fit}
      tone={hero ? "hero" : "default"}
      data-jump={jump}
      tabIndex={jump ? -1 : undefined}
    >
      {wrapped(
        frame,
        <Header aria-label={frame.editing ? t("edit.controls", { block: title }) : undefined}>
          <Icon aria-hidden />
          <DashboardPanelTitle id={titleId}>{title}</DashboardPanelTitle>
          {count !== undefined && count > 0 && <Badge variant="destructive">{count}</Badge>}
          {frame.controls}
        </Header>,
      )}
      <BlockBody frame={frame} titleId={titleId} note={note} startAt={startAt} fits={fits}>
        {children}
      </BlockBody>
      {frame.footer && children ? (
        <DashboardPanelFooter inert={frame.editing}>{frame.footer}</DashboardPanelFooter>
      ) : null}
    </DashboardPanel>
  );
}

function wrapped(frame: TileFrame, header: ReactElement): ReactNode {
  return frame.wrapHeader ? frame.wrapHeader(header) : header;
}

interface BlockBodyProps {
  frame: TileFrame;
  titleId: string;
  note: ReactNode;
  startAt: string | undefined;
  fits: boolean;
  children: ReactNode;
}

function BlockBody({ frame, titleId, note, startAt, fits, children }: BlockBodyProps) {
  const openAt = useOpenAt(startAt, frame);

  if (!children) return null;

  const content = (
    <>
      {note && <DashboardPanelNote>{note}</DashboardPanelNote>}
      {children}
    </>
  );

  if (fits || frame.size === "s" || frame.flows)
    return <DashboardPanelBody inert={frame.editing}>{content}</DashboardPanelBody>;

  return (
    <ScrollRegion variant="tile" aria-labelledby={titleId} inert={frame.editing} ref={openAt}>
      {content}
    </ScrollRegion>
  );
}

function useOpenAt(
  startAt: string | undefined,
  { size, scroll }: TileFrame,
): (region: HTMLDivElement | null) => void {
  const [region, setRegion] = useState<HTMLDivElement | null>(null);
  const [kept] = useState(() => scroll?.read());

  // biome-ignore lint/correctness/useExhaustiveDependencies: a tile drawn at another size shows another stretch of its list, so the jump is made again
  useEffect(() => {
    if (!region) return;

    const settle = () => {
      if (kept !== undefined) return scrollBackTo(region, kept);

      return !startAt || scrollToJump(region, startAt);
    };
    if (settle()) return;

    const observer = new MutationObserver(() => {
      if (settle()) observer.disconnect();
    });
    observer.observe(region, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, [region, startAt, size, kept]);

  useEffect(() => {
    if (!region || !scroll) return;

    const keep = () => scroll.keep(region.scrollTop);
    region.addEventListener("scroll", keep, { passive: true });

    return () => region.removeEventListener("scroll", keep);
  }, [region, scroll]);

  return setRegion;
}

/** Puts a body drawn again back where it was, once its list is long enough to get there. */
function scrollBackTo(region: HTMLElement, top: number): boolean {
  region.scrollTop = top;

  return Math.abs(region.scrollTop - top) <= 1;
}

function scrollToJump(region: HTMLElement, jump: string): boolean {
  const target = region.querySelector(`[data-jump="${jump}"]`);
  if (!target) return false;

  const padding = Number.parseFloat(getComputedStyle(region).scrollPaddingTop) || 0;
  const offset = target.getBoundingClientRect().top - region.getBoundingClientRect().top;
  region.scrollTop += offset - padding;

  return true;
}

import { Badge } from "@packages/ui/components/ui/badge";
import {
  DashboardEmpty,
  DashboardPanel,
  DashboardPanelBody,
  DashboardPanelFooter,
  DashboardPanelHeader,
  DashboardPanelNote,
  DashboardPanelTitle,
  DashboardTileToolbar,
} from "@packages/ui/components/ui/dashboard";
import { ScrollRegion } from "@packages/ui/components/ui/scroll-region";
import type { LucideIcon } from "lucide-react";
import { type ReactElement, type ReactNode, useCallback, useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { type TileFrame, useTileFrame } from "../../../../shared/dashboard/tile-frame";

export interface BlockPanelProps {
  title: string;
  label?: string;
  count?: number;
  icon: LucideIcon;
  note?: ReactNode;
  fit?: "card" | "natural";
  startAt?: string;
  jump?: string;
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
      <BlockBody frame={frame} titleId={titleId} icon={Icon} note={note} startAt={startAt}>
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
  icon: LucideIcon;
  note: ReactNode;
  startAt: string | undefined;
  children: ReactNode;
}

function BlockBody({ frame, titleId, icon: Icon, note, startAt, children }: BlockBodyProps) {
  const openAt = useOpenAt(startAt, frame);

  if (!children && note)
    return (
      <DashboardEmpty inert={frame.editing}>
        <Icon aria-hidden />
        <p>{note}</p>
      </DashboardEmpty>
    );

  if (!children) return null;

  const content = (
    <>
      {note && <DashboardPanelNote>{note}</DashboardPanelNote>}
      {children}
    </>
  );

  if (frame.size === "s" || frame.flows)
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
    if (!region || !startAt || kept !== undefined) return;
    if (scrollToJump(region, startAt)) return;

    const observer = new MutationObserver(() => {
      if (scrollToJump(region, startAt)) observer.disconnect();
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

  return useCallback(
    (node: HTMLDivElement | null) => {
      if (node && kept !== undefined) node.scrollTop = kept;

      setRegion(node);
    },
    [kept],
  );
}

function scrollToJump(region: HTMLElement, jump: string): boolean {
  const target = region.querySelector(`[data-jump="${jump}"]`);
  if (!target) return false;

  const padding = Number.parseFloat(getComputedStyle(region).scrollPaddingTop) || 0;
  const offset = target.getBoundingClientRect().top - region.getBoundingClientRect().top;
  region.scrollTop += offset - padding;

  return true;
}

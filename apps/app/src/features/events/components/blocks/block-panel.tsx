import { Badge } from "@packages/ui/components/ui/badge";
import {
  DashboardPanel,
  DashboardPanelBody,
  DashboardPanelFooter,
  DashboardPanelHeader,
  DashboardPanelHeroBody,
  DashboardPanelHeroDate,
  DashboardPanelNote,
  DashboardPanelSummary,
  DashboardPanelTitle,
  DashboardTileToolbar,
  type HeroDate,
} from "@packages/ui/components/ui/dashboard";
import type { Icon } from "@packages/ui/components/ui/icons";
import { ScrollRegion } from "@packages/ui/components/ui/scroll-region";
import {
  createContext,
  type ReactElement,
  type ReactNode,
  useContext,
  useEffect,
  useId,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { type TileFrame, useTileFrame } from "../../../../shared/dashboard/tile-frame";
import { wallDateParts } from "../../../../shared/format/deadline-label";

export interface BlockPanelProps {
  title: string;
  label?: string;
  count?: number;
  icon: Icon;
  note?: ReactNode;
  fit?: "card" | "natural";
  startAt?: string;
  jump?: string;
  /** The day the block answers for, shown large when the advice makes it the hero. */
  heroDate?: HeroDate;
  /** The sentence under the hero that sums up its answer. */
  summary?: ReactNode;
  fits?: boolean;
  /** The block keeps its own controls still and scrolls only the part it wraps in `BlockScrollArea`. */
  scrollsInside?: boolean;
  children?: ReactNode;
}

type ScrollWrap = (children: ReactNode) => ReactNode;

/**
 * The size whose body is too short to keep a block's controls still: under them only a slit
 * would scroll. There the whole body scrolls once and opens on the controls, not on `startAt`.
 */
const ROOMLESS_SIZE = "m";

const BlockScrollContext = createContext<ScrollWrap | null>(null);

/**
 * The part of a block that scrolls when the block keeps its controls still (`scrollsInside`).
 * Outside a fixed tile (a phone, a small tile, a page of its own) it lays its content out as is.
 */
export function BlockScrollArea({ children }: { children: ReactNode }) {
  const wrap = useContext(BlockScrollContext);

  return wrap ? wrap(children) : children;
}

export function heroDateOf(date: string): HeroDate {
  const { day, month, weekday } = wallDateParts(date);

  return { dateTime: date, day, month, weekday };
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
  heroDate,
  summary,
  fits = false,
  scrollsInside = false,
  children,
}: BlockPanelProps) {
  const { t } = useTranslation("home");
  const titleId = useId();
  const frame = useTileFrame();
  const Header = frame.editing ? DashboardTileToolbar : DashboardPanelHeader;
  const heroDay = frame.hero ? heroDate : undefined;
  const body = (
    <BlockBody
      frame={frame}
      titleId={titleId}
      note={note}
      startAt={startAt}
      fits={fits}
      scrollsInside={scrollsInside}
    >
      {children}
    </BlockBody>
  );

  return (
    <DashboardPanel
      aria-label={label}
      aria-labelledby={label ? undefined : titleId}
      fit={fit}
      tone={frame.hero ? "hero" : "default"}
      data-jump={jump}
      tabIndex={jump ? -1 : undefined}
    >
      {wrapped(
        frame,
        <Header aria-label={frame.editing ? t("edit.controls", { block: title }) : undefined}>
          {heroDay && <DashboardPanelHeroDate date={heroDay} />}
          <Icon aria-hidden />
          <DashboardPanelTitle id={titleId}>{title}</DashboardPanelTitle>
          {count !== undefined && count > 0 && <Badge variant="destructive">{count}</Badge>}
          {frame.controls}
        </Header>,
      )}
      {heroDay ? <DashboardPanelHeroBody date={heroDay}>{body}</DashboardPanelHeroBody> : body}
      {frame.hero && summary ? (
        <DashboardPanelSummary inert={frame.editing}>{summary}</DashboardPanelSummary>
      ) : null}
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
  scrollsInside: boolean;
  children: ReactNode;
}

function BlockBody({
  frame,
  titleId,
  note,
  startAt,
  fits,
  scrollsInside,
  children,
}: BlockBodyProps) {
  const stillControls = scrollsInside && frame.size !== ROOMLESS_SIZE;
  const openAt = useOpenAt(scrollsInside && !stillControls ? undefined : startAt, frame);

  if (!children) return null;

  const content = (
    <>
      {note && <DashboardPanelNote>{note}</DashboardPanelNote>}
      {children}
    </>
  );

  if (fits || frame.size === "s" || frame.flows)
    return <DashboardPanelBody inert={frame.editing}>{content}</DashboardPanelBody>;

  if (stillControls) {
    const wrap: ScrollWrap = (inside) => (
      <ScrollRegion
        variant="tile"
        aria-labelledby={titleId}
        inert={frame.editing}
        ref={openAt}
        stickyHead
      >
        {inside}
      </ScrollRegion>
    );

    return (
      <DashboardPanelBody inert={frame.editing}>
        <BlockScrollContext value={wrap}>{content}</BlockScrollContext>
      </DashboardPanelBody>
    );
  }

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

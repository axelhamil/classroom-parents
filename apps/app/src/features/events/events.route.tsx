import { Button } from "@packages/ui/components/ui/button";
import { ArrangeIcon, BackIcon, DoneIcon, FamilyIcon } from "@packages/ui/components/ui/icons";
import { userStorageKey, useStoredValue } from "@packages/web-kit/storage/use-stored-value";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import type { SchoolClock } from "../../shared/agenda/school-clock";
import { useSchoolClock } from "../../shared/agenda/school-clock-context";
import { type ChildDto, childrenQueryOptions } from "../../shared/api/queries/children";
import { redirectToOnboardingWithoutChild } from "../../shared/children/redirect-to-onboarding";
import { HomeGrid } from "../../shared/dashboard/home-grid";
import { type Draft, withoutPinned } from "../../shared/dashboard/layout-commands";
import { LayoutSyncNotice } from "../../shared/dashboard/layout-sync-notice";
import { CategoryFilter } from "../../shared/events/category-filter";
import { BoardEmpty, EventBoard, EventBoardSkeleton } from "../../shared/events/event-board";
import { Screen } from "../../shared/layout/screen";
import { reflow } from "../../shared/motion/reflow";
import { QueryState } from "../../shared/query/query-state";
import { ScreenTour } from "../../shared/tour/screen-tour";
import type { AdviceSnapshot } from "./advise-context";
import { calendarEventsQueryOptions } from "./api/events.queries";
import { placePeriod } from "./calendar";
import { BlockedChildrenNotice } from "./components/blocked-children-notice";
import { EventOverlay } from "./components/event-overlay";
import { FamilyRow } from "./components/family-row";
import { type HomeSearch, homeSearchSchema } from "./events.schema";
import { ADVICE_ONLY_BLOCK_IDS } from "./home-block-sizes";
import { type RegisteredBlock, useHomeRegistry } from "./home-blocks";
import { useAdviceSnapshot } from "./hooks/use-advice-snapshot";
import { type AdvisedHome, useAdvisedHome } from "./hooks/use-advised-home";
import { useCelebrateProgress } from "./hooks/use-celebrate-progress";
import { ADVISED_LAYOUT, type HomeSync, useHomeSync } from "./hooks/use-home-sync";
import { firstNameOf } from "./week";

export const Route = createFileRoute("/_protected/_shell/")({
  validateSearch: homeSearchSchema,
  beforeLoad: redirectToOnboardingWithoutChild,
  component: HomePage,
});

const SELECTED_CHILD_SCHEMA = z.string().nullable();

const NO_CHILDREN: readonly ChildDto[] = [];

interface HomeArrangement {
  sync: HomeSync;
  registry: readonly RegisteredBlock[];
  order: Draft;
  advice: AdvisedHome | null;
  snapshot: AdviceSnapshot | null;
  editing: boolean;
  edit: () => void;
  done: () => void;
  reset: () => void;
}

function HomePage() {
  const { t } = useTranslation("events");
  const { user } = Route.useRouteContext();
  const search = Route.useSearch();
  const router = useRouter();
  const clock = useSchoolClock();
  const home = useHomeArrangement(user.id, clock);
  const name = firstNameOf(user.name);
  const greeting =
    clock.greeting === "evening"
      ? t("home.greeting.evening", { name })
      : t("home.greeting.morning", { name });

  return (
    <Screen
      width="wide"
      title={name ? greeting : t("list.title")}
      actions={
        search.tab !== "history" && (
          <EditHomeButton editing={home.editing} onToggle={home.editing ? home.done : home.edit} />
        )
      }
    >
      <HomeBoard clock={clock} home={home} />
      {search.event && (
        <EventOverlay eventId={search.event} onClose={() => router.history.back()} />
      )}
    </Screen>
  );
}

/**
 * The layout of the home, kept by the edit machine, and the advised layout drawn while the parent
 * arranged nothing. Entering and leaving the arranged home rearranges the page through `reflow`.
 */
function useHomeArrangement(userId: string, clock: SchoolClock): HomeArrangement {
  const family = useQuery(childrenQueryOptions).data ?? NO_CHILDREN;
  const registry = useHomeRegistry(family);
  const ids = useMemo(() => registry.map(({ id }) => id), [registry]);
  const savableIds = useMemo(() => withoutPinned(ids, ADVICE_ONLY_BLOCK_IDS), [ids]);
  const sync = useHomeSync(userId, savableIds);
  const snapshot = useAdviceSnapshot(userId, clock);
  const advice = useAdvisedHome(ids, snapshot);
  const advised = advice?.blocks ?? ADVISED_LAYOUT;
  const send = sync.send;
  const main = () => document.querySelector("main");

  return {
    sync,
    registry,
    order: sync.order ?? advised,
    advice,
    snapshot,
    editing: sync.editState !== "viewing",
    edit: () =>
      reflow(main(), () => send({ type: "EDIT", advice: sync.order ? undefined : advised })),
    done: () => reflow(main(), () => send({ type: "DONE" })),
    reset: () => {
      send({ type: "RESET" });
      send({ type: "CONFIRM_RESET", layout: ADVISED_LAYOUT, shown: advised });
    },
  };
}

interface EditHomeButtonProps {
  editing: boolean;
  onToggle: () => void;
}

function EditHomeButton({ editing, onToggle }: EditHomeButtonProps) {
  const { t } = useTranslation("home");

  return (
    <Button
      type="button"
      size="sm"
      variant={editing ? "default" : "outline"}
      data-tour="home-edit"
      onClick={onToggle}
    >
      {editing ? <DoneIcon aria-hidden /> : <ArrangeIcon aria-hidden />}
      {editing ? t("edit.done") : t("edit.start")}
    </Button>
  );
}

interface HomeBoardProps {
  clock: SchoolClock;
  home: HomeArrangement;
}

function HomeBoard({ clock, home }: HomeBoardProps) {
  const { t } = useTranslation("events");
  const children = useQuery(childrenQueryOptions);
  const skeleton = <EventBoardSkeleton label={t("calendar.loading")} />;
  const adviceAwaited = home.sync.order === null && home.advice === null;

  if ((!home.sync.known || adviceAwaited) && !children.isError) return skeleton;

  return (
    <QueryState
      query={children}
      skeleton={skeleton}
      empty={
        <BoardEmpty
          icon={FamilyIcon}
          title={t("empty.noChild.title")}
          description={t("empty.noChild.description")}
          action={
            <Button asChild size="sm">
              <Link to="/children/new">{t("empty.noChild.action")}</Link>
            </Button>
          }
        />
      }
      isEmpty={(family) => family.length === 0}
    >
      {(family) => <FamilyHome family={family} clock={clock} home={home} />}
    </QueryState>
  );
}

interface FamilyHomeProps {
  family: readonly ChildDto[];
  clock: SchoolClock;
  home: HomeArrangement;
}

function FamilyHome({ family, clock, home }: FamilyHomeProps) {
  const { t } = useTranslation("events");
  const { user } = Route.useRouteContext();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [stored, setStored] = useStoredValue(
    userStorageKey(user.id, "family:child"),
    SELECTED_CHILD_SCHEMA,
    null,
  );
  const requested = search.childId ?? stored;
  const childId = family.some((child) => child.id === requested) ? requested : null;
  const { period } = placePeriod(search, clock);
  const loaded = useQuery(calendarEventsQueryOptions(period)).data ?? [];
  const shown = (blockId: string) => home.order.some(({ id }) => id === blockId);
  const briefingShown = shown("today");
  const overdueShown = shown("overdue");
  const advice = home.snapshot;
  const context = useMemo(
    () => ({ userId: user.id, family, childId, clock, briefingShown, overdueShown, advice }),
    [user.id, family, childId, clock, briefingShown, overdueShown, advice],
  );
  useCelebrateProgress(clock);

  const setSearch = (next: Partial<HomeSearch>) =>
    void navigate({ search: (prev) => ({ ...prev, ...next }), replace: true });

  const selectChild = (next: string | null) => {
    setStored(next);
    setSearch({ childId: next ?? undefined });
  };

  if (search.tab === "history")
    return (
      <div className="flex flex-col gap-4">
        <Button asChild variant="ghost" className="self-start">
          <Link to="/" search={{ view: search.view, date: search.date }}>
            <BackIcon aria-hidden />
            {t("calendar.backToCalendar")}
          </Link>
        </Button>
        <CategoryFilter
          value={search.category ?? null}
          onChange={(category) => setSearch({ category })}
        />
        <EventBoard
          scope="history"
          filters={{ category: search.category ?? null, childId }}
          family={family}
          onResetFilters={() => {
            setStored(null);
            setSearch({ category: undefined, childId: undefined });
          }}
        />
      </div>
    );

  return (
    <div className="flex flex-col gap-6">
      <BlockedChildrenNotice childrenList={family} />
      <LayoutSyncNotice actor={home.sync.actor} />
      <HomeGrid
        order={home.order}
        advised={home.sync.order === null}
        heroId={home.advice?.heroId ?? null}
        blocks={home.registry}
        adviceOnly={ADVICE_ONLY_BLOCK_IDS}
        context={context}
        actor={home.sync.actor}
        onEdit={home.edit}
        onReset={home.reset}
        header={
          family.length > 1 && (
            <FamilyRow
              family={family}
              events={loaded}
              value={childId}
              onChange={(next) => reflow(document.querySelector("main"), () => selectChild(next))}
            />
          )
        }
      />
      {!home.editing && !search.event && <ScreenTour screen="home" userId={user.id} />}
    </div>
  );
}

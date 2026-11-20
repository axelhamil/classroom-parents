import { Button } from "@packages/ui/components/ui/button";
import { userStorageKey, useStoredValue } from "@packages/web-kit/storage/use-stored-value";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ArrowLeftIcon, CheckIcon, LayoutGridIcon, UsersRoundIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import type { SchoolClock } from "../../shared/agenda/school-clock";
import { useSchoolClock } from "../../shared/agenda/school-clock-context";
import { type ChildDto, childrenQueryOptions } from "../../shared/api/queries/children";
import { redirectToOnboardingWithoutChild } from "../../shared/children/redirect-to-onboarding";
import { DashboardGrid } from "../../shared/dashboard/dashboard-grid";
import { CategoryFilter } from "../../shared/events/category-filter";
import { BoardEmpty, EventBoard, EventBoardSkeleton } from "../../shared/events/event-board";
import { Screen } from "../../shared/layout/screen";
import { reflow } from "../../shared/motion/reflow";
import { QueryState } from "../../shared/query/query-state";
import { ScreenTour } from "../../shared/tour/screen-tour";
import { calendarEventsQueryOptions } from "./api/events.queries";
import { placePeriod } from "./calendar";
import { BlockedChildrenNotice } from "./components/blocked-children-notice";
import { EventOverlay } from "./components/event-overlay";
import { FamilyRow } from "./components/family-row";
import { type HomeSearch, homeSearchSchema } from "./events.schema";
import { useHomeRegistry } from "./home-blocks";
import { useCelebrateProgress } from "./hooks/use-celebrate-progress";
import { useHomeLayout } from "./hooks/use-home-layout";
import { firstNameOf } from "./week";

export const Route = createFileRoute("/_protected/_shell/")({
  validateSearch: homeSearchSchema,
  beforeLoad: redirectToOnboardingWithoutChild,
  component: HomePage,
});

const SELECTED_CHILD_SCHEMA = z.string().nullable();

function HomePage() {
  const { t } = useTranslation("events");
  const { user } = Route.useRouteContext();
  const search = Route.useSearch();
  const router = useRouter();
  const clock = useSchoolClock();
  const [editing, setEditing] = useState(false);
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
          <EditHomeButton editing={editing} onToggle={() => setEditing(!editing)} />
        )
      }
    >
      <HomeBoard clock={clock} editing={editing} />
      {search.event && (
        <EventOverlay eventId={search.event} onClose={() => router.history.back()} />
      )}
    </Screen>
  );
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
      {editing ? <CheckIcon aria-hidden /> : <LayoutGridIcon aria-hidden />}
      {editing ? t("edit.done") : t("edit.start")}
    </Button>
  );
}

interface HomeBoardProps {
  clock: SchoolClock;
  editing: boolean;
}

function HomeBoard({ clock, editing }: HomeBoardProps) {
  const { t } = useTranslation("events");
  const children = useQuery(childrenQueryOptions);

  return (
    <QueryState
      query={children}
      skeleton={<EventBoardSkeleton label={t("calendar.loading")} />}
      empty={
        <BoardEmpty
          icon={UsersRoundIcon}
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
      {(family) => <FamilyHome family={family} clock={clock} editing={editing} />}
    </QueryState>
  );
}

interface FamilyHomeProps {
  family: readonly ChildDto[];
  clock: SchoolClock;
  editing: boolean;
}

function FamilyHome({ family, clock, editing }: FamilyHomeProps) {
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
  const registry = useHomeRegistry(family);
  const home = useHomeLayout(registry.blocks, registry.defaults);
  const shown = (blockId: string) =>
    home.layout.some(({ id, hidden }) => id === blockId && !hidden);
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
            <ArrowLeftIcon aria-hidden />
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
      <DashboardGrid
        layout={home.layout}
        blocks={registry.blocks}
        context={{
          family,
          childId,
          clock,
          briefingShown: shown("today"),
          overdueShown: shown("overdue"),
        }}
        editing={editing}
        onChange={home.change}
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
      {!editing && !search.event && <ScreenTour screen="home" userId={user.id} />}
    </div>
  );
}

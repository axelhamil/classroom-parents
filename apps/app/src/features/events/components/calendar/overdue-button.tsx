import { Badge } from "@packages/ui/components/ui/badge";
import { Button } from "@packages/ui/components/ui/button";
import { OpenRowIcon, OverdueIcon } from "@packages/ui/components/ui/icons";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { bySoonest } from "../../../../shared/agenda/deadline-facts";
import { useSchoolClock } from "../../../../shared/agenda/school-clock-context";
import { lateWindow } from "../../../../shared/agenda/windows";
import type { ChildDto } from "../../../../shared/api/queries/children";
import { ResponsiveOverlay } from "../../../../shared/layout/responsive-overlay";
import { useLate } from "../../hooks/use-late";
import { OlderLateLink } from "../older-late-link";
import { OverdueList } from "./overdue-list";

export interface OverdueButtonProps {
  family: readonly ChildDto[];
  childId: string | null;
  before: string;
}

/**
 * The calendar's way to the late deadlines when the home has no late block: the same list and count
 * as the block, offered while one of them sits before the period on screen.
 */
export function OverdueButton({ family, childId, before }: OverdueButtonProps) {
  const { t } = useTranslation("events");
  const clock = useSchoolClock();
  const trigger = useRef<HTMLButtonElement>(null);
  const [opened, setOpened] = useState<readonly string[] | null>(null);
  const { late, older, loaded } = useLate(clock, childId);
  const shown = loaded
    .filter((event) => opened?.includes(event.id))
    .sort((left, right) => bySoonest(right, left));
  const title = t("calendar.overdueCount", { count: late.length });
  const offered = late.some((event) => event.deadlineDate < before);

  return (
    <>
      {offered && (
        <Button
          ref={trigger}
          variant="outline"
          className="w-full"
          aria-haspopup="dialog"
          aria-label={title}
          onClick={() => setOpened(late.map((event) => event.id))}
        >
          <OverdueIcon aria-hidden />
          {t("calendar.overdue")}
          <Badge variant="destructive">{late.length}</Badge>
          <OpenRowIcon aria-hidden className="ms-auto" />
        </Button>
      )}
      {opened && (
        <ResponsiveOverlay
          docked="dialog"
          title={title}
          description={t("calendar.overdueWindow", { count: lateWindow.days })}
          returnFocus={() => (trigger.current ? [trigger.current] : [])}
          onClose={() => setOpened(null)}
        >
          <OverdueList events={shown} family={family} today={clock.today} />
          <OlderLateLink count={older} />
        </ResponsiveOverlay>
      )}
    </>
  );
}

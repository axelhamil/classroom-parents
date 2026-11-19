import { DAY_MS } from "@packages/ddd-kit/days";
import { utcDay } from "@packages/i18n";
import { Badge } from "@packages/ui/components/ui/badge";
import { ChildAvatar } from "@packages/ui/components/ui/child-avatar";
import { DateTab } from "@packages/ui/components/ui/date-tab";
import {
  PlannerCard,
  PlannerCardBody,
  PlannerCardMeta,
  PlannerCardStickers,
  PlannerCardTitle,
} from "@packages/ui/components/ui/planner-card";
import { TypographyMuted } from "@packages/ui/components/ui/typography";
import type { Control } from "react-hook-form";
import { useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import type { ChildDto } from "../api/queries/children";
import { deadlineLabel, wallDateParts } from "../format/deadline-label";
import { schoolToday } from "../format/school-today";
import { childAvatarSrc } from "./child-avatar-src";
import type { ChildProfileInput } from "./child-profile.schema";

export interface ChildProfilePreviewProps {
  control: Control<ChildProfileInput>;
  child: ChildDto;
}

function tomorrowOf(now: Date): string {
  return new Date(utcDay(schoolToday(now)) + DAY_MS).toISOString().slice(0, 10);
}

export function ChildProfilePreview({ control, child }: ChildProfilePreviewProps) {
  const { t } = useTranslation("children");
  const [typed, hue, showsPhoto] = useWatch({ control, name: ["label", "color", "showsPhoto"] });
  const label = typed.trim() || child.label;
  const now = new Date();
  const deadline = tomorrowOf(now);
  const date = wallDateParts(deadline);

  return (
    <div aria-hidden className="flex flex-col gap-2">
      <TypographyMuted>{t("customize.preview")}</TypographyMuted>
      <PlannerCard>
        <DateTab
          dateTime={deadline}
          hue={hue}
          day={date.day}
          month={date.month}
          weekday={date.weekday}
        />
        <PlannerCardBody>
          <PlannerCardTitle>{t("customize.previewTitle")}</PlannerCardTitle>
          <PlannerCardMeta>{deadlineLabel(deadline, undefined, now)}</PlannerCardMeta>
          <PlannerCardStickers>
            <Badge hue={hue} className="max-w-full">
              <ChildAvatar
                name={label}
                tone={hue}
                src={childAvatarSrc({ avatarUrl: child.avatarUrl, showsPhoto })}
                size="xs"
              />
              <span className="truncate">{label}</span>
            </Badge>
          </PlannerCardStickers>
        </PlannerCardBody>
      </PlannerCard>
    </div>
  );
}

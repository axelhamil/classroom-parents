import { shiftDate } from "@packages/ddd-kit/days";
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
import { useSchoolClock } from "../agenda/school-clock-context";
import type { ChildDto } from "../api/queries/children";
import { deadlineLabel, wallDateParts } from "../format/deadline-label";
import { childAvatarSrc } from "./child-avatar-src";
import type { ChildProfileInput } from "./child-profile.schema";

export interface ChildProfilePreviewProps {
  control: Control<ChildProfileInput>;
  child: ChildDto;
}

export function ChildProfilePreview({ control, child }: ChildProfilePreviewProps) {
  const { t } = useTranslation("children");
  const [typed, hue, showsPhoto] = useWatch({ control, name: ["label", "color", "showsPhoto"] });
  const label = typed.trim() || child.label;
  const { today } = useSchoolClock();
  const deadline = shiftDate(today, 1);
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
          <PlannerCardMeta>{deadlineLabel(deadline, undefined, today)}</PlannerCardMeta>
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

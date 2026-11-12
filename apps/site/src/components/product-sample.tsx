import type { frCatalog } from "@packages/i18n";
import { Badge } from "@packages/ui/components/ui/badge";
import { BrandMark } from "@packages/ui/components/ui/brand-link";
import { ChildAvatar, type ChildTone } from "@packages/ui/components/ui/child-avatar";
import { DateTab } from "@packages/ui/components/ui/date-tab";
import {
  LandingVisual,
  NotificationPreview,
  NotificationPreviewContent,
  SampleFrame,
  SampleFrameHeader,
  SampleStack,
} from "@packages/ui/components/ui/landing";
import {
  PlannerCard,
  PlannerCardBody,
  PlannerCardMeta,
  PlannerCardStickers,
  PlannerCardTitle,
} from "@packages/ui/components/ui/planner-card";
import { AlarmClockIcon, ClipboardCheckIcon, PenLineIcon, WavesIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { relativeDayLabel, type SampleDayCopy, sampleDay, schoolToday } from "./sample-week";

const CATEGORY_ICONS = {
  assessment: ClipboardCheckIcon,
  swimming: WavesIcon,
  documentDue: PenLineIcon,
} as const;

export type SampleCategory = keyof typeof CATEGORY_ICONS;

export interface SampleDeadline {
  id: string;
  title: string;
  daysAhead: number;
  time: string;
  category: SampleCategory;
  categoryLabel: string;
  childLabel: string;
  hue: ChildTone;
  countdown: string | null;
}

export interface ProductSampleProps {
  brand: string;
  copy: (typeof frCatalog)["site"]["sample"];
  dayCopy: SampleDayCopy;
  deadlines: SampleDeadline[];
}

export function ProductSample({ brand, copy, dayCopy, deadlines }: ProductSampleProps) {
  const [today, setToday] = useState<string | null>(null);

  useEffect(() => setToday(schoolToday(new Date())), []);

  return (
    <LandingVisual data-reveal="hidden">
      <NotificationPreview>
        <BrandMark />
        <NotificationPreviewContent>
          <p>
            {brand}
            <span>{copy.notification.time}</span>
          </p>
          <p>{copy.notification.title}</p>
          <p>{copy.notification.body}</p>
        </NotificationPreviewContent>
      </NotificationPreview>
      <SampleFrame>
        <SampleFrameHeader>
          {copy.week}
          <span className="flex gap-3">
            <ChildAvatar name={copy.lea} tone={5} size="sm" />
            <ChildAvatar name={copy.malo} tone={2} size="sm" />
          </span>
        </SampleFrameHeader>
        <SampleStack inert>
          {deadlines.map((deadline) => {
            const day = today ? sampleDay(today, deadline.daysAhead, deadline.time, dayCopy) : null;
            const label =
              day?.label ?? relativeDayLabel(deadline.daysAhead, deadline.time, dayCopy);
            const CategoryIcon = CATEGORY_ICONS[deadline.category];

            return (
              <li key={deadline.id}>
                <PlannerCard>
                  {day && (
                    <DateTab
                      dateTime={day.date}
                      hue={deadline.hue}
                      day={day.day}
                      month={day.month}
                      weekday={day.weekday}
                      aria-hidden
                    />
                  )}
                  <PlannerCardBody>
                    <PlannerCardTitle>{deadline.title}</PlannerCardTitle>
                    <PlannerCardMeta>
                      {deadline.countdown ? (
                        <>
                          {label}
                          <Badge variant="soon">{deadline.countdown}</Badge>
                        </>
                      ) : (
                        <Badge variant="urgent">
                          <AlarmClockIcon aria-hidden />
                          {label}
                        </Badge>
                      )}
                    </PlannerCardMeta>
                    <PlannerCardStickers>
                      <Badge variant={deadline.category}>
                        <CategoryIcon aria-hidden />
                        {deadline.categoryLabel}
                      </Badge>
                      <Badge hue={deadline.hue} className="max-w-full">
                        <ChildAvatar name={deadline.childLabel} tone={deadline.hue} size="xs" />
                        <span className="truncate">{deadline.childLabel}</span>
                      </Badge>
                    </PlannerCardStickers>
                  </PlannerCardBody>
                </PlannerCard>
              </li>
            );
          })}
        </SampleStack>
      </SampleFrame>
      <figcaption>{copy.caption}</figcaption>
    </LandingVisual>
  );
}

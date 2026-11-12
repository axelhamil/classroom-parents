import { DAY_MS } from "@packages/ddd-kit/days";
import { utcDay } from "@packages/i18n";
import {
  LandingSection,
  LandingSectionTitle,
  SampleFrame,
  SampleStack,
} from "@packages/ui/components/ui/landing";
import { useTranslation } from "react-i18next";
import type { EventItem } from "../../../shared/api/queries/events";
import { EventCard } from "../../../shared/events/event-card";
import type { ChildHue } from "../../../shared/format/child-hue";
import { schoolToday } from "../../../shared/format/school-today";

interface SampleDeadline {
  event: EventItem;
  childLabel: string;
  hue: ChildHue;
}

function inDays(today: string, days: number): string {
  return new Date(utcDay(today) + days * DAY_MS).toISOString().slice(0, 10);
}

function sampleEvent(
  id: string,
  title: string,
  category: EventItem["category"],
  deadlineDate: string,
  deadlineTime: string,
): EventItem {
  return {
    id,
    childId: id,
    title,
    description: "",
    category,
    deadlineDate,
    deadlineTime,
    deadlineAt: `${deadlineDate}T${deadlineTime}:00.000Z`,
    status: "confirmed",
    source: "announcement",
    done: false,
    announcementUrl: "",
    receivedAt: `${deadlineDate}T00:00:00.000Z`,
    edited: false,
    editedFields: [],
  };
}

export function ProductSample() {
  const { t } = useTranslation("auth");
  const today = schoolToday(new Date());
  const deadlines: SampleDeadline[] = [
    {
      event: sampleEvent(
        "sample-fractions",
        t("landing.sample.fractions"),
        "assessment",
        inDays(today, 1),
        "08:30",
      ),
      childLabel: t("landing.sample.lea"),
      hue: 5,
    },
    {
      event: sampleEvent(
        "sample-swimming",
        t("landing.sample.swimming"),
        "swimming",
        inDays(today, 3),
        "13:45",
      ),
      childLabel: t("landing.sample.malo"),
      hue: 2,
    },
    {
      event: sampleEvent(
        "sample-museum",
        t("landing.sample.museum"),
        "document_due",
        inDays(today, 5),
        "08:30",
      ),
      childLabel: t("landing.sample.lea"),
      hue: 5,
    },
  ];

  return (
    <LandingSection aria-labelledby="sample-title">
      <LandingSectionTitle id="sample-title">{t("landing.sample.title")}</LandingSectionTitle>
      <SampleFrame>
        <SampleStack inert>
          {deadlines.map(({ event, childLabel, hue }) => (
            <li key={event.id}>
              <EventCard event={event} childLabel={childLabel} hue={hue} />
            </li>
          ))}
        </SampleStack>
        <figcaption>{t("landing.sample.caption")}</figcaption>
      </SampleFrame>
    </LandingSection>
  );
}

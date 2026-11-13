import type { TourStep } from "@packages/ui/components/ui/tour";
import { resetTours } from "@packages/web-kit/tour/tour-store";
import { useTranslation } from "react-i18next";

const TOURS = {
  home: ["home.week", "home.family", "home.tabs", "home.share", "home.nav"],
  "event-detail": [
    "event-detail.when",
    "event-detail.prepare",
    "event-detail.agenda",
    "event-detail.reminders",
  ],
  children: ["children.card", "children.menu", "children.add"],
  settings: ["settings.push", "settings.reminders", "settings.devices", "settings.tour"],
} as const;

export type TourScreen = keyof typeof TOURS;

const TOUR_SCREENS = Object.keys(TOURS).filter((screen): screen is TourScreen => screen in TOURS);

export function useTourSteps(screen: TourScreen): TourStep[] {
  const { t } = useTranslation("tour");

  return TOURS[screen].map((key) => ({
    target: key.replace(".", "-"),
    title: t(`${key}.title`),
    body: t(`${key}.body`),
  }));
}

export function restartTours(userId: string): void {
  resetTours(userId, TOUR_SCREENS);
}

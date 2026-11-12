import { Tour } from "@packages/ui/components/ui/tour";
import { useTour } from "@packages/web-kit/tour/tour-store";
import { useTranslation } from "react-i18next";
import { type TourScreen, useTourSteps } from "./tours";

export interface ScreenTourProps {
  screen: TourScreen;
  userId: string;
}

export function ScreenTour({ screen, userId }: ScreenTourProps) {
  const { t } = useTranslation("tour");
  const tour = useTour(screen, userId);
  const steps = useTourSteps(screen);

  return (
    <Tour
      steps={steps}
      open={tour.open}
      onDone={tour.done}
      labels={{
        progress: (current, total) => t("controls.progress", { current, total }),
        previous: t("controls.previous"),
        next: t("controls.next"),
        skip: t("controls.skip"),
        finish: t("controls.finish"),
      }}
    />
  );
}

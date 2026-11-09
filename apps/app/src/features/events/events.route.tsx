import { DateTab } from "@packages/ui/components/ui/date-tab";
import { TypographyMuted } from "@packages/ui/components/ui/typography";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Screen } from "../../shared/layout/screen";

export const Route = createFileRoute("/_protected/_shell/")({
  component: EventsPage,
});

function EventsPage() {
  const { t, i18n } = useTranslation("events");
  const today = new Date();
  const part = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(i18n.language, options).format(today);

  return (
    <Screen
      title={t("list.title")}
      aside={
        <DateTab
          dateTime={today.toISOString().slice(0, 10)}
          day={part({ day: "numeric" })}
          month={part({ month: "short" })}
          weekday={part({ weekday: "short" })}
          title={t("list.today")}
        />
      }
    >
      <TypographyMuted>{t("list.empty")}</TypographyMuted>
    </Screen>
  );
}

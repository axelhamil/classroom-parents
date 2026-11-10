import { wallTimeLabel } from "@packages/i18n";
import { useTranslation } from "react-i18next";
import type { Reminder } from "./reminders.schema";

export function useReminderLabel(): (reminder: Reminder) => string {
  const { t } = useTranslation("common");

  return (reminder) => {
    if (reminder.kind === "hours_before")
      return t("reminders.hoursBefore", { count: reminder.hours });

    const time = wallTimeLabel(reminder.time);
    if (reminder.days === 0) return t("reminders.sameDay", { time });
    if (reminder.days === 1) return t("reminders.dayBefore", { time });

    return t("reminders.daysBefore", { days: reminder.days, time });
  };
}

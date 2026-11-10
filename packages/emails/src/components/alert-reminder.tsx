import { Button, Heading, Text } from "react-email";
import type { EmailProps } from "../templates";
import { EmailLayout } from "./layout";

export function AlertReminder({
  childLabel,
  eventTitle,
  deadlineLabel,
  eventUrl,
  t,
}: EmailProps<"alert_reminder">) {
  return (
    <EmailLayout preview={t("subjects.alertReminder", { eventTitle, childLabel })} t={t}>
      <Heading as="h1">{eventTitle}</Heading>
      <Text>{t("alertReminder.body", { childLabel, deadlineLabel })}</Text>
      <Button href={eventUrl}>{t("alertReminder.cta")}</Button>
      <Text>{eventUrl}</Text>
    </EmailLayout>
  );
}

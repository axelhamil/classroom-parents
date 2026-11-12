import { Button, Heading, Text } from "react-email";
import type { EmailProps } from "../templates";
import { EmailLayout } from "./layout";

export function WeeklyDigest({ summary, appUrl, t }: EmailProps<"weekly_digest">) {
  return (
    <EmailLayout preview={summary} t={t}>
      <Heading as="h1">{t("subjects.weeklyDigest")}</Heading>
      <Text>{summary}</Text>
      <Button href={appUrl}>{t("weeklyDigest.cta")}</Button>
      <Text>{appUrl}</Text>
    </EmailLayout>
  );
}

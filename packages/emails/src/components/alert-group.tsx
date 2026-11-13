import type { TFunction } from "i18next";
import { Button, Heading, Text } from "react-email";
import type { EmailProps, EmailTemplates } from "../templates";
import { EmailLayout } from "./layout";

export function alertGroupSubject(
  t: TFunction<"emails">,
  { itemCount }: Pick<EmailTemplates["alert_group"], "itemCount">,
): string {
  return t("subjects.alertGroup", { count: Number(itemCount) });
}

export function AlertGroup({ itemCount, items, appUrl, t }: EmailProps<"alert_group">) {
  const subject = alertGroupSubject(t, { itemCount });

  return (
    <EmailLayout preview={subject} t={t}>
      <Heading as="h1">{subject}</Heading>
      {items.split("\n").map((line, index) => (
        /* biome-ignore lint/suspicious/noArrayIndexKey: rendered once on the server, never reordered, and two deadlines may read the same */
        <Text key={index}>{line}</Text>
      ))}
      <Button href={appUrl}>{t("alertGroup.cta")}</Button>
      <Text>{appUrl}</Text>
    </EmailLayout>
  );
}

import { Button, Heading, Text } from "react-email";
import type { EmailProps } from "../templates";
import { EmailLayout } from "./layout";

export function AccessLost({ childLabel, childrenUrl, t }: EmailProps<"access_lost">) {
  const subject = t("subjects.accessLost", { childLabel });

  return (
    <EmailLayout preview={subject} t={t}>
      <Heading as="h1">{subject}</Heading>
      <Text>{t("accessLost.body", { childLabel })}</Text>
      <Button href={childrenUrl}>{t("accessLost.cta")}</Button>
      <Text>{childrenUrl}</Text>
    </EmailLayout>
  );
}

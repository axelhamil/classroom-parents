import { TextLink } from "@packages/ui/components/ui/text-link";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

export interface OlderLateLinkProps {
  count: number;
}

/** Points to the history for the late deadlines older than the late window, so none silently drops out. */
export function OlderLateLink({ count }: OlderLateLinkProps) {
  const { t } = useTranslation("home");
  if (count === 0) return null;

  return (
    <TextLink asChild>
      <Link to="/" search={{ tab: "history" }}>
        {t("blocks.overdue.older", { count })}
      </Link>
    </TextLink>
  );
}

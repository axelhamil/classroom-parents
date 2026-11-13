import { Button } from "@packages/ui/components/ui/button";
import { ChildAvatar } from "@packages/ui/components/ui/child-avatar";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { BellRing, Link2, Mail, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ChildDto } from "../../../shared/api/queries/children";
import { pushStatusQueryOptions } from "../../../shared/api/queries/push-status";
import type { ChildHue } from "../../../shared/format/child-hue";
import { StepFrame } from "./step-frame";
import { StepList } from "./step-list";

export interface DoneStepProps {
  child: ChildDto;
  hue: ChildHue;
  userId: string;
  avatarUrl?: string | null;
}

export function DoneStep({ child, hue, userId, avatarUrl }: DoneStepProps) {
  const { t } = useTranslation("onboarding");
  const pushLive = (useQuery(pushStatusQueryOptions(userId)).data?.live ?? 0) > 0;

  return (
    <StepFrame
      media={<ChildAvatar name={child.label} tone={hue} src={avatarUrl} size="lg" />}
      mediaTone="bare"
      title={t("done.title")}
      description={t("done.description", { label: child.label })}
      actions={
        <>
          <Button asChild size="lg">
            <Link to="/">{t("done.home")}</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/children/new">
              <Plus aria-hidden />
              {t("done.addAnother")}
            </Link>
          </Button>
        </>
      }
    >
      <StepList
        entries={[
          {
            id: "account",
            icon: Link2,
            title: t("done.account", { email: child.googleEmail }),
          },
          pushLive
            ? { id: "push", icon: BellRing, title: t("done.pushOn") }
            : { id: "push", icon: Mail, title: t("done.pushOff") },
        ]}
      />
    </StepFrame>
  );
}

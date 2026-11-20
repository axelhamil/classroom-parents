import { Button } from "@packages/ui/components/ui/button";
import { ChildAvatar } from "@packages/ui/components/ui/child-avatar";
import {
  AddIcon,
  AlertsOnIcon,
  EmailIcon,
  LinkAccountIcon,
} from "@packages/ui/components/ui/icons";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { ChildDto } from "../../../shared/api/queries/children";
import { pushStatusQueryOptions } from "../../../shared/api/queries/push-status";
import { childAvatarSrc } from "../../../shared/children/child-avatar-src";
import type { ChildHue } from "../../../shared/format/child-hue";
import { StepFrame } from "./step-frame";
import { StepList } from "./step-list";

export interface DoneStepProps {
  child: ChildDto;
  hue: ChildHue;
  userId: string;
}

export function DoneStep({ child, hue, userId }: DoneStepProps) {
  const { t } = useTranslation("onboarding");
  const pushLive = (useQuery(pushStatusQueryOptions(userId)).data?.live ?? 0) > 0;

  return (
    <StepFrame
      media={<ChildAvatar name={child.label} tone={hue} src={childAvatarSrc(child)} size="lg" />}
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
              <AddIcon aria-hidden />
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
            icon: LinkAccountIcon,
            title: t("done.account", { email: child.googleEmail }),
          },
          pushLive
            ? { id: "push", icon: AlertsOnIcon, title: t("done.pushOn") }
            : { id: "push", icon: EmailIcon, title: t("done.pushOff") },
        ]}
      />
    </StepFrame>
  );
}

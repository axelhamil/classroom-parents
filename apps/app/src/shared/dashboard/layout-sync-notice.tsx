import { Button } from "@packages/ui/components/ui/button";
import { useSelector } from "@xstate/react";
import { useTranslation } from "react-i18next";
import type { ActorRefFrom } from "xstate";
import { ActionAlert } from "../components/action-alert";
import type { homeEditMachine } from "./home-edit.machine";

export interface LayoutSyncNoticeProps {
  actor: ActorRefFrom<typeof homeEditMachine>;
}

export function LayoutSyncNotice({ actor }: LayoutSyncNoticeProps) {
  const { t } = useTranslation("home");
  const conflict = useSelector(actor, (snapshot) => snapshot.matches({ sync: "conflict" }));
  if (!conflict) return null;

  return (
    <ActionAlert
      tone="warning"
      density="compact"
      title={t("sync.conflict.title")}
      action={
        <>
          <Button size="sm" onClick={() => actor.send({ type: "TAKE_THEIRS" })}>
            {t("sync.conflict.takeTheirs")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => actor.send({ type: "KEEP_MINE" })}>
            {t("sync.conflict.keepMine")}
          </Button>
        </>
      }
    />
  );
}

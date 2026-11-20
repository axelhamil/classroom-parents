import { Alert, AlertDescription } from "@packages/ui/components/ui/alert";
import { AlertsOffIcon, EmailIcon } from "@packages/ui/components/ui/icons";
import {
  SettingsGroup,
  SettingsRow,
  settingsRowDescriptionId,
} from "@packages/ui/components/ui/settings";
import { Switch } from "@packages/ui/components/ui/switch";
import { useQuery } from "@tanstack/react-query";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { setLockScreenMutationOptions } from "../../../shared/api/mutations/set-lock-screen";
import { lockScreenQueryOptions } from "../../../shared/api/queries/lock-screen";
import { pushStatusQueryOptions } from "../../../shared/api/queries/push-status";
import { InstallButton } from "../../../shared/pwa/install-button";
import { InstallGuide } from "../../../shared/pwa/install-guide";
import { PushDeniedAlert } from "../../../shared/pwa/push-denied-alert";
import { useInstallState } from "../../../shared/pwa/use-install-state";
import {
  type PushSubscriptionState,
  usePushSubscription,
} from "../../../shared/pwa/use-push-subscription";
import { useAutoSave } from "../hooks/use-auto-save";
import { SETTINGS_ANCHORS } from "../settings-search-index";

interface PushCardProps {
  userId: string;
}

export function PushCard({ userId }: PushCardProps) {
  const { t } = useTranslation("settings");
  const { platform, standalone } = useInstallState();
  const push = usePushSubscription(userId);
  const status = useQuery(pushStatusQueryOptions(userId));
  const needsInstall = platform === "ios" && !standalone;
  const emailFallback = !push.subscribed && status.data?.live === 0;

  return (
    <SettingsGroup id={SETTINGS_ANCHORS.push} title={t("push.title")}>
      <PushRow push={push} needsInstall={needsInstall} />
      {push.subscribed ? <LockScreenRow userId={userId} /> : null}
      {emailFallback ? (
        <Alert>
          <EmailIcon />
          <AlertDescription>{t("push.emailFallback")}</AlertDescription>
        </Alert>
      ) : null}
    </SettingsGroup>
  );
}

interface PushRowProps {
  push: PushSubscriptionState;
  needsInstall: boolean;
}

function PushRow({ push, needsInstall }: PushRowProps) {
  const { t } = useTranslation("settings");
  const id = useId();
  const supported = push.permission !== "unsupported" && push.permission !== "denied";

  const toggle = (on: boolean) => void (on ? push.enable() : push.disable());

  return (
    <SettingsRow
      label={t("push.receive")}
      description={push.subscribed ? t("push.enabledBody") : t("push.description")}
      controlId={id}
      control={
        <Switch
          id={id}
          checked={push.subscribed}
          disabled={!supported || needsInstall || push.pending}
          onCheckedChange={toggle}
          aria-describedby={settingsRowDescriptionId(id)}
        />
      }
    >
      {needsInstall ? <InstallGuide /> : <InstallButton />}
      <PushBlocked permission={push.permission} />
    </SettingsRow>
  );
}

function PushBlocked({ permission }: { permission: PushSubscriptionState["permission"] }) {
  const { t } = useTranslation("settings");

  if (permission === "denied") return <PushDeniedAlert />;
  if (permission !== "unsupported") return null;

  return (
    <Alert>
      <AlertsOffIcon />
      <AlertDescription>{t("push.unsupported")}</AlertDescription>
    </Alert>
  );
}

function LockScreenRow({ userId }: PushCardProps) {
  const { t } = useTranslation("settings");
  const id = useId();
  const query = lockScreenQueryOptions(userId);
  const details = useQuery(query);
  const { save } = useAutoSave({
    mutation: setLockScreenMutationOptions,
    queryKey: query.queryKey,
    apply: (_shown, next) => next,
    merge: (_stored, saved) => saved,
    restoreValue: (shown) => shown,
    failure: "setLockScreen",
  });
  if (!details.isSuccess) return null;

  return (
    <SettingsRow
      label={t("push.lockScreen")}
      description={details.data ? t("push.lockScreenShown") : t("push.lockScreenHidden")}
      controlId={id}
      control={
        <Switch
          id={id}
          checked={details.data}
          onCheckedChange={save}
          aria-describedby={settingsRowDescriptionId(id)}
        />
      }
    />
  );
}

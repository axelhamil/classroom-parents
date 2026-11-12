import { Alert, AlertDescription, AlertTitle } from "@packages/ui/components/ui/alert";
import { Badge } from "@packages/ui/components/ui/badge";
import { Button } from "@packages/ui/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "@packages/ui/components/ui/field";
import { Hint } from "@packages/ui/components/ui/hint";
import { SectionCard } from "@packages/ui/components/ui/section-card";
import { Switch } from "@packages/ui/components/ui/switch";
import { TypographyMuted, TypographyP } from "@packages/ui/components/ui/typography";
import { toastError } from "@packages/web-kit/api/errors/toast";
import { errorFallback } from "@packages/web-kit/i18n/get-errors-t";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellOff, BellRing, Mail } from "lucide-react";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { setLockScreenMutationOptions } from "../../../shared/api/mutations/set-lock-screen";
import { defaultRemindersQueryOptions } from "../../../shared/api/queries/default-reminders";
import { lockScreenQueryOptions } from "../../../shared/api/queries/lock-screen";
import { pushStatusQueryOptions } from "../../../shared/api/queries/push-status";
import { InstallGuide } from "../../../shared/pwa/install-guide";
import { useInstallState } from "../../../shared/pwa/use-install-state";
import {
  type PushSubscriptionState,
  usePushSubscription,
} from "../../../shared/pwa/use-push-subscription";
import { useReminderLabel } from "../../../shared/reminders/use-reminder-label";

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
    <SectionCard
      title={t("push.title")}
      description={t("push.description")}
      data-tour="settings-push"
    >
      <DefaultRemindersSummary userId={userId} />
      {needsInstall ? <InstallGuide /> : null}
      <PushControl push={push} needsInstall={needsInstall} />
      {push.subscribed ? <LockScreenSwitch userId={userId} /> : null}
      {emailFallback ? (
        <Alert>
          <Mail />
          <AlertDescription>{t("push.emailFallback")}</AlertDescription>
        </Alert>
      ) : null}
    </SectionCard>
  );
}

const LOCALE = "fr-FR";
const LIST_FORMAT = new Intl.ListFormat(LOCALE, { type: "conjunction" });

function inSentence(label: string): string {
  return label.charAt(0).toLocaleLowerCase(LOCALE) + label.slice(1);
}

function DefaultRemindersSummary({ userId }: PushCardProps) {
  const { t } = useTranslation("settings");
  const label = useReminderLabel();
  const defaults = useQuery(defaultRemindersQueryOptions(userId));
  if (!defaults.isSuccess) return null;
  if (defaults.data.length === 0) return <TypographyMuted>{t("push.noDefaults")}</TypographyMuted>;

  return (
    <TypographyMuted>
      {t("push.defaults", {
        reminders: LIST_FORMAT.format(defaults.data.map((reminder) => inSentence(label(reminder)))),
      })}
    </TypographyMuted>
  );
}

interface PushControlProps {
  push: PushSubscriptionState;
  needsInstall: boolean;
}

function PushControl({ push, needsInstall }: PushControlProps) {
  const { t } = useTranslation("settings");

  if (needsInstall) {
    return (
      <Hint text={t("push.installFirst")} className="self-start">
        <Button type="button" disabled>
          <BellRing />
          {t("push.enable")}
        </Button>
      </Hint>
    );
  }

  if (push.permission === "unsupported") {
    return (
      <Alert>
        <BellOff />
        <AlertDescription>{t("push.unsupported")}</AlertDescription>
      </Alert>
    );
  }

  if (push.permission === "denied") {
    return (
      <Alert>
        <BellOff />
        <AlertTitle>{t("push.deniedTitle")}</AlertTitle>
        <AlertDescription>{t("push.denied")}</AlertDescription>
      </Alert>
    );
  }

  if (push.subscribed) {
    return (
      <>
        <Badge>
          <BellRing />
          {t("push.enabled")}
        </Badge>
        <TypographyP>{t("push.enabledBody")}</TypographyP>
        <Button
          type="button"
          variant="outline"
          className="self-start"
          disabled={push.pending}
          onClick={() => void push.disable()}
        >
          {push.pending ? t("push.disabling") : t("push.disable")}
        </Button>
      </>
    );
  }

  return (
    <Button
      type="button"
      className="self-start"
      disabled={push.pending}
      onClick={() => void push.enable()}
    >
      <BellRing />
      {push.pending ? t("push.enabling") : t("push.enable")}
    </Button>
  );
}

function LockScreenSwitch({ userId }: PushCardProps) {
  const { t } = useTranslation("settings");
  const id = useId();
  const queryClient = useQueryClient();
  const details = useQuery(lockScreenQueryOptions(userId));
  const save = useMutation({
    ...setLockScreenMutationOptions,
    onSuccess: (shown) => queryClient.setQueryData(lockScreenQueryOptions(userId).queryKey, shown),
    onError: (error) => toastError(error, errorFallback("setLockScreen")),
  });
  if (!details.isSuccess) return null;

  const shown = save.isPending ? save.variables : details.data;
  return (
    <Field orientation="horizontal">
      <Switch
        id={id}
        checked={shown}
        disabled={save.isPending}
        onCheckedChange={(checked) => save.mutate(checked)}
        aria-describedby={`${id}-description`}
      />
      <FieldContent>
        <FieldLabel htmlFor={id}>{t("push.lockScreen")}</FieldLabel>
        <FieldDescription id={`${id}-description`}>
          {shown ? t("push.lockScreenShown") : t("push.lockScreenHidden")}
        </FieldDescription>
      </FieldContent>
    </Field>
  );
}

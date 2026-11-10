import type { AlertsSettings } from "@modules/alerts/application/config/alerts-settings";
import type { ChildrenSettings } from "@modules/children/application/config/children-settings";
import { CLASSROOM_SCOPES } from "@modules/children/application/config/classroom-scopes";
import { defineModule } from "inwire";
import type { RgpdSettings } from "../modules/rgpd/application/config/rgpd-settings";
import { SESSION_FRESH_AGE_SECONDS } from "../shared/auth/session-freshness";
import type { env } from "../shared/env";

type SettingsSource = Pick<
  typeof env,
  | "APP_ORIGIN"
  | "SWEEP_DEADLINE_MS"
  | "RGPD_GRACE_PERIOD_DAYS"
  | "RGPD_SWEEP_BATCH_SIZE"
  | "GOOGLE_CLIENT_ID"
  | "GOOGLE_CLIENT_SECRET"
  | "ANTHROPIC_API_KEY"
  | "VAPID_PUBLIC_KEY"
  | "VAPID_PRIVATE_KEY"
  | "VAPID_SUBJECT"
  | "RESEND_FROM"
>;

export const apiSettings = (source: SettingsSource) => {
  const rgpdSettings: RgpdSettings = {
    appUrl: source.APP_ORIGIN,
    gracePeriodDays: source.RGPD_GRACE_PERIOD_DAYS,
    freshSessionMaxAgeMs: SESSION_FRESH_AGE_SECONDS * 1000,
    sweepDeadlineMs: source.SWEEP_DEADLINE_MS,
    sweepBatchSize: source.RGPD_SWEEP_BATCH_SIZE,
  };
  const childrenSettings: ChildrenSettings = {
    classroomScopes: CLASSROOM_SCOPES,
    googleClientId: source.GOOGLE_CLIENT_ID,
    googleClientSecret: source.GOOGLE_CLIENT_SECRET,
  };
  const alertsSettings: AlertsSettings = {
    vapidPublicKey: source.VAPID_PUBLIC_KEY ?? "",
    vapidPrivateKey: source.VAPID_PRIVATE_KEY ?? "",
    vapidSubject: source.VAPID_SUBJECT ?? "",
    emailFrom: source.RESEND_FROM ?? "",
  };
  const extractionSettings = {
    anthropicApiKey: source.ANTHROPIC_API_KEY ?? "",
  };

  return defineModule<Record<never, never>>()((b) =>
    b
      .add("rgpdSettings", (): RgpdSettings => rgpdSettings)
      .add("childrenSettings", (): ChildrenSettings => childrenSettings)
      .add("extractionSettings", () => extractionSettings)
      .add("alertsSettings", (): AlertsSettings => alertsSettings),
  );
};

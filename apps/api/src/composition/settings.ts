import { defineModule } from "inwire";
import type { RgpdSettings } from "../modules/rgpd/application/config/rgpd-settings";
import { SESSION_FRESH_AGE_SECONDS } from "../shared/auth/session-freshness";
import type { env } from "../shared/env";

type SettingsSource = Pick<
  typeof env,
  "APP_ORIGIN" | "SWEEP_DEADLINE_MS" | "RGPD_GRACE_PERIOD_DAYS" | "RGPD_SWEEP_BATCH_SIZE"
>;

export const apiSettings = (source: SettingsSource) => {
  const rgpdSettings: RgpdSettings = {
    appUrl: source.APP_ORIGIN,
    gracePeriodDays: source.RGPD_GRACE_PERIOD_DAYS,
    freshSessionMaxAgeMs: SESSION_FRESH_AGE_SECONDS * 1000,
    sweepDeadlineMs: source.SWEEP_DEADLINE_MS,
    sweepBatchSize: source.RGPD_SWEEP_BATCH_SIZE,
  };

  return defineModule<Record<never, never>>()((b) =>
    b.add("rgpdSettings", (): RgpdSettings => rgpdSettings),
  );
};

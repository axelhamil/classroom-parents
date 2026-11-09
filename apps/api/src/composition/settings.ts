import { defineModule } from "inwire";
import type { RgpdSettings } from "../modules/rgpd/application/config/rgpd-settings";
import type { env } from "../shared/env";

type SettingsSource = Pick<
  typeof env,
  "APP_ORIGIN" | "SWEEP_DEADLINE_MS" | "RGPD_GRACE_PERIOD_DAYS" | "RGPD_SWEEP_BATCH_SIZE"
>;

const FRESH_SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export const apiSettings = (source: SettingsSource) => {
  const rgpdSettings: RgpdSettings = {
    appUrl: source.APP_ORIGIN,
    gracePeriodDays: source.RGPD_GRACE_PERIOD_DAYS,
    freshSessionMaxAgeMs: FRESH_SESSION_MAX_AGE_MS,
    sweepDeadlineMs: source.SWEEP_DEADLINE_MS,
    sweepBatchSize: source.RGPD_SWEEP_BATCH_SIZE,
  };

  return defineModule<Record<never, never>>()((b) =>
    b.add("rgpdSettings", (): RgpdSettings => rgpdSettings),
  );
};

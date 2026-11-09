export interface RgpdSettings {
  appUrl: string;
  gracePeriodDays: number;
  freshSessionMaxAgeMs: number;
  sweepDeadlineMs: number;
  sweepBatchSize: number;
}

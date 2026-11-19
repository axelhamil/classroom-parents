import type { Option, Result } from "@packages/ddd-kit";
import type { AssistantError } from "../errors/assistant-errors";

export type AiUsageAlertKind = "family_cap" | "global_spend" | "output_invalid";

export interface AiUsageAlertKey {
  kind: AiUsageAlertKind;
  period: string;
  userId: Option<string>;
}

export interface IAiUsageAlertLog {
  claim(key: AiUsageAlertKey): Promise<Result<boolean, AssistantError>>;
}

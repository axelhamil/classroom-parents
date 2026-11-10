import type { IAlertPlanner } from "@modules/agenda/application/ports/alert-planner.port";
import { Result } from "@packages/ddd-kit";

export const alertsNotComposedYet: IAlertPlanner = {
  planDefault: async () => Result.ok(),
  replan: async () => Result.ok(),
  cancel: async () => Result.ok(),
};

import { defineModule } from "inwire";

export type AlertsPrerequisites = Record<never, never>;

export const alertsModule = defineModule<AlertsPrerequisites>()((b) => b);

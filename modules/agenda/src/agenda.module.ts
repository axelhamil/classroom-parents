import { defineModule } from "inwire";

export type AgendaPrerequisites = Record<never, never>;

export const agendaModule = defineModule<AgendaPrerequisites>()((b) => b);

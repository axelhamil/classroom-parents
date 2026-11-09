import { defineModule } from "inwire";

export type ClassroomSyncPrerequisites = Record<never, never>;

export const classroomSyncModule = defineModule<ClassroomSyncPrerequisites>()((b) => b);

import { defineModule } from "inwire";

export type ChildrenPrerequisites = Record<never, never>;

export const childrenModule = defineModule<ChildrenPrerequisites>()((b) => b);

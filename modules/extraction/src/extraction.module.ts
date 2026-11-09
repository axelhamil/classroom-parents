import { defineModule } from "inwire";

export type ExtractionPrerequisites = Record<never, never>;

export const extractionModule = defineModule<ExtractionPrerequisites>()((b) => b);

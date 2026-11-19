import { Option, Result } from "@packages/ddd-kit";
import type { IExtractionCache } from "../src/application/ports/extraction-cache.port";

/** An evaluation reads every case with the model: a shared result would hide what it costs. */
export const NO_SHARED_CACHE: IExtractionCache = {
  find: async () => Result.ok(Option.none()),
  store: async () => Result.ok(),
};

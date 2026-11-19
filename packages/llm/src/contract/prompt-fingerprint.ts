import { createHash } from "node:crypto";
import { z } from "zod";

/**
 * A stable hash of what the model is asked: the instructions and the output schema. A test
 * pins it next to the prompt's `PROMPT_VERSION`, so editing either without bumping the version
 * fails the build, and every cost row, cache entry and eval result names the prompt it ran.
 */
export function promptFingerprint(system: string, schema: z.ZodType): string {
  const jsonSchema = JSON.stringify(z.toJSONSchema(schema));

  return createHash("sha256").update(system).update("\n").update(jsonSchema).digest("hex");
}

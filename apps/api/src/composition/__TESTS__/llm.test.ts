import { describe, expect, it } from "bun:test";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import { z } from "zod";
import { envSchema } from "../../shared/env-schema";
import { languageModelFor } from "../llm";

const request = {
  scope: { userId: "parent-a" },
  feature: "announcement_extraction" as const,
  promptVersion: "extraction-2",
  tier: "fast" as const,
  maxOutputTokens: 400,
  system: "static system",
  context: [],
  data: "Contrôle jeudi",
  schema: z.object({ ok: z.boolean() }),
};

describe("languageModelFor", () => {
  it("switches every model feature off when the key is absent, without reaching the provider", async () => {
    const instrumentation = mockInstrumentation();
    const model = languageModelFor({ anthropicApiKey: "", disabledFeatures: [] }, instrumentation);

    const result = await model.parse(request);

    expect(result.getError().code).toBe("LLM_DISABLED");
    expect(instrumentation.startSpan).not.toHaveBeenCalled();
  });

  it("switches off a feature listed in the settings", async () => {
    const model = languageModelFor(
      { anthropicApiKey: "sk-ant-test", disabledFeatures: ["announcement_extraction"] },
      mockInstrumentation(),
    );

    expect((await model.parse(request)).getError().code).toBe("LLM_DISABLED");
  });
});

describe("AI_DISABLED_FEATURES", () => {
  const disabled = (value: string | undefined) =>
    envSchema.shape.AI_DISABLED_FEATURES.safeParse(value);

  it("reads a comma separated list of known features and defaults to none", () => {
    expect(disabled(" announcement_extraction ,").data).toEqual(["announcement_extraction"]);
    expect(disabled(undefined).data).toEqual([]);
  });

  it("refuses a feature the kit does not know, so a typo cannot leave it on", () => {
    expect(disabled("announcement_extractoin").success).toBe(false);
  });
});

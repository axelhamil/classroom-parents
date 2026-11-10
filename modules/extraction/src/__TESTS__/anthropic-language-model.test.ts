import { beforeEach, describe, expect, it, mock } from "bun:test";
import Anthropic from "@anthropic-ai/sdk";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import { z } from "zod";
import { AnthropicLanguageModel } from "../infrastructure/adapters/anthropic-language-model";

const schema = z.object({ events: z.array(z.object({ title: z.string() })) });
const SECRET_TEXT = "Exposé de Zoé pour jeudi";

type FetchMock = ReturnType<
  typeof mock<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>
>;

let fetchMock: FetchMock;
let instrumentation: ReturnType<typeof mockInstrumentation>;
let model: AnthropicLanguageModel;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "request-id": "req_test" },
  });
}

function message(text: string | null, stopReason = "end_turn"): Response {
  return jsonResponse(200, {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-haiku-5-5",
    content: text === null ? [] : [{ type: "text", text }],
    stop_reason: stopReason,
    stop_sequence: null,
    usage: {
      input_tokens: 40,
      output_tokens: 12,
      cache_read_input_tokens: 1800,
      cache_creation_input_tokens: 0,
    },
  });
}

function apiError(status: number, type: string): Response {
  return jsonResponse(status, { type: "error", error: { type, message: "upstream" } });
}

async function sentBody(): Promise<Record<string, unknown>> {
  const [, init] = fetchMock.mock.calls[0] ?? [];

  return JSON.parse(String(init?.body));
}

function parse(tier: "fast" | "strong" = "fast") {
  return model.parse({ tier, system: "static system", user: SECRET_TEXT, schema });
}

beforeEach(() => {
  fetchMock = mock();
  instrumentation = mockInstrumentation();
  const client = new Anthropic({ apiKey: "test-key", maxRetries: 0, fetch: fetchMock });
  model = new AnthropicLanguageModel(client, instrumentation);
});

describe("AnthropicLanguageModel.parse", () => {
  it("asks haiku at low effort with a cached system prefix and returns the parsed output", async () => {
    fetchMock.mockResolvedValueOnce(message('{"events":[{"title":"Contrôle"}]}'));

    const result = await parse("fast");

    expect(result.getValue()).toEqual({ events: [{ title: "Contrôle" }] });
    expect(await sentBody()).toMatchObject({
      model: "claude-haiku-5-5",
      system: [{ type: "text", text: "static system", cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: SECRET_TEXT }],
      output_config: { effort: "low", format: { type: "json_schema" } },
    });
  });

  it("asks sonnet on the strong tier", async () => {
    fetchMock.mockResolvedValueOnce(message('{"events":[]}'));

    await parse("strong");

    expect(await sentBody()).toMatchObject({ model: "claude-sonnet-5-5" });
  });

  it("maps a 429 to a rate limit", async () => {
    fetchMock.mockResolvedValueOnce(apiError(429, "rate_limit_error"));

    expect((await parse()).getError().code).toBe("EXTRACTION_RATE_LIMITED");
  });

  it("maps a 5xx to a provider failure and reports it", async () => {
    fetchMock.mockResolvedValueOnce(apiError(529, "overloaded_error"));

    expect((await parse()).getError().code).toBe("EXTRACTION_PROVIDER_FAILURE");
    expect(instrumentation.capture).toHaveBeenCalledTimes(1);
  });

  it("maps a refusal to an invalid output, so the announcement is not retried forever", async () => {
    fetchMock.mockResolvedValueOnce(message(null, "refusal"));

    expect((await parse()).getError().code).toBe("EXTRACTION_OUTPUT_INVALID");
  });

  it("maps a request the API rejects as malformed to an invalid input, not an outage", async () => {
    fetchMock.mockResolvedValueOnce(apiError(400, "invalid_request_error"));

    expect((await parse()).getError().code).toBe("EXTRACTION_INPUT_INVALID");
  });

  it("maps output that is not JSON or not the schema to an invalid output, without the text in telemetry", async () => {
    fetchMock.mockResolvedValueOnce(message(`{"events": [${SECRET_TEXT}`));
    fetchMock.mockResolvedValueOnce(message('{"events":[{"name":"Zoé"}]}'));

    expect((await parse()).getError().code).toBe("EXTRACTION_OUTPUT_INVALID");
    expect((await parse()).getError().code).toBe("EXTRACTION_OUTPUT_INVALID");
    const captured = instrumentation.capture.mock.calls.map(([error, context]) =>
      JSON.stringify({ message: error instanceof Error ? error.message : error, context }),
    );
    expect(captured).toHaveLength(2);
    expect(captured.join()).not.toContain("Zo");
  });
});

import { type IInstrumentation, Result } from "@packages/ddd-kit";
import { instrumentedFetch } from "@packages/http/instrumented-fetch";
import type { z } from "zod";
import {
  type SchoolCalendarError,
  sourceFailure,
} from "../../application/errors/school-calendar-errors";

const TIMEOUT_MS = 5_000;

/** One GET of an official calendar: a span, a 5 s timeout, a validated body, any failure captured and typed. */
export class JsonClient {
  constructor(
    private readonly instrumentation: IInstrumentation,
    private readonly fetchImpl: typeof fetch,
  ) {}

  async get<T>(
    operation: string,
    url: string,
    schema: z.ZodType<T>,
  ): Promise<Result<T, SchoolCalendarError>> {
    try {
      const response = await instrumentedFetch(this.instrumentation, this.fetchImpl, url, {
        method: "GET",
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) {
        this.instrumentation.capture(new Error(`${url} answered ${response.status}`));
        return Result.fail(sourceFailure(operation));
      }

      const parsed = schema.safeParse(await response.json());
      if (!parsed.success) {
        this.instrumentation.capture(parsed.error);
        return Result.fail(sourceFailure(operation));
      }
      return Result.ok(parsed.data);
    } catch (err) {
      this.instrumentation.capture(err);
      return Result.fail(sourceFailure(operation));
    }
  }
}

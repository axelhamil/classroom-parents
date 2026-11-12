import { describe, expect, it, mock } from "bun:test";
import { serializeError } from "../error-serializer";
import { LoggingInstrumentation } from "../services/logging-instrumentation";
import { duplicateAccountFailure, EMAIL_VALUE, TOKEN_VALUE } from "./failed-query.fixture";

describe("LoggingInstrumentation", () => {
  it("writes a captured driver error to the log, so a store failure is seen without a provider", () => {
    const error = mock((_fields: unknown, _message: string) => {});
    const driverError = new Error("connection refused");

    new LoggingInstrumentation({ error }).capture(driverError);

    expect(error.mock.calls[0]?.[0]).toMatchObject({ err: driverError });
  });

  it("logs a captured store failure with its database cause and none of the query values", () => {
    const error = mock((_fields: { err?: unknown }, _message: string) => {});

    new LoggingInstrumentation({ error }).capture(duplicateAccountFailure());

    const logged = serializeError(error.mock.calls[0]?.[0].err);
    expect(logged).toMatchObject({
      code: "CHILD_PROVIDER_FAILURE",
      database: { code: "23505", table: "account", constraint: "account_email_key" },
    });
    expect(JSON.stringify(logged)).not.toContain(EMAIL_VALUE);
    expect(JSON.stringify(logged)).not.toContain(TOKEN_VALUE);
  });
});

import { describe, expect, it } from "bun:test";
import { AppErrorException } from "@packages/ddd-kit";
import { DrizzleQueryError } from "@packages/drizzle";
import { serializeError } from "../error-serializer";
import { duplicateAccountQuery, EMAIL_VALUE, TOKEN_VALUE } from "./failed-query.fixture";

const SQL = 'select "reminders" from "alert_event_reminders" where "user_id" = $1';
const QUERY_VALUE = "parent@example.fr";

function missingTable() {
  return Object.assign(new Error('relation "alert_event_reminders" does not exist'), {
    code: "42P01",
    severity: "ERROR",
    routine: "parserOpenTable",
    detail: `Key (email)=(${QUERY_VALUE}) already exists.`,
  });
}

function failedQuery() {
  return new DrizzleQueryError(SQL, [QUERY_VALUE], missingTable());
}

describe("serializeError", () => {
  it("logs the SQL and the database code of the cause behind an application error", () => {
    const err = new AppErrorException({
      code: "ALERT_PROVIDER_FAILURE",
      message: "database operation failed: eventPlansFor",
      cause: failedQuery(),
    });

    expect(serializeError(err)).toMatchObject({
      code: "ALERT_PROVIDER_FAILURE",
      message: expect.stringContaining(`${SQL}: relation "alert_event_reminders" does not exist`),
      stack: expect.stringContaining("caused by:"),
      database: { code: "42P01", severity: "ERROR", routine: "parserOpenTable" },
    });
  });

  it("never logs the values bound to the query", () => {
    const logged = serializeError(failedQuery());

    expect(logged).toMatchObject({ message: expect.stringContaining(SQL) });
    expect(JSON.stringify(logged)).not.toContain(QUERY_VALUE);
  });

  it("logs a failure object of another shape without the values of its query cause", () => {
    const failure = {
      code: "EMAIL_QUEUE_WRITE_FAILED",
      message: "enqueue failed",
      cause: duplicateAccountQuery(),
    };

    const logged = JSON.stringify(serializeError(failure));

    expect(logged).toContain('"code":"23505"');
    expect(logged).not.toContain(EMAIL_VALUE);
    expect(logged).not.toContain(TOKEN_VALUE);
  });

  it("logs a value that is not an error as it is", () => {
    expect(serializeError("boom")).toBe("boom");
  });
});

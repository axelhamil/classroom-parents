import { afterAll, describe, expect, it } from "bun:test";
import { scrubEvent } from "@packages/sentry-scrub";
import * as Sentry from "@sentry/bun";
import { SentryInstrumentation } from "../services/sentry-instrumentation";
import {
  duplicateAccountFailure,
  EMAIL_VALUE,
  INSERT_SQL,
  TOKEN_VALUE,
} from "./failed-query.fixture";

const sent: Sentry.ErrorEvent[] = [];

Sentry.init({
  dsn: "https://public@sentry.invalid/1",
  integrations: (defaults) => defaults.filter(({ name }) => name !== "ContextLines"),
  beforeSend: (event) => {
    sent.push(scrubEvent(event));
    return null;
  },
});

afterAll(() => Sentry.close(0));

describe("SentryInstrumentation, real event through the scrubber", () => {
  it("sends a captured store failure as the chain of its causes, without the query values", async () => {
    new SentryInstrumentation().capture(duplicateAccountFailure());
    await Sentry.flush(1000);

    const event = sent.at(-1);
    const values = event?.exception?.values?.map(({ value }) => value) ?? [];
    expect(values).toEqual(
      expect.arrayContaining([
        "database operation failed: create",
        `Failed query: ${INSERT_SQL}`,
        'duplicate key value violates unique constraint "account_email_key"',
      ]),
    );
    expect(JSON.stringify(event)).not.toContain(TOKEN_VALUE);
    expect(JSON.stringify(event)).not.toContain(EMAIL_VALUE);
    expect(JSON.stringify(event)).not.toContain("already exists");
  });
});

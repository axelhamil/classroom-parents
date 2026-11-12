import { asException } from "@packages/ddd-kit";
import { stripQueryValues } from "@packages/sentry-scrub";
import { stdSerializers } from "pino";

const MAX_CAUSES = 5;
const VALUE_BEARING_KEYS = new Set(["params", "detail", "query", "where", "cause"]);
const DATABASE_KEYS = ["code", "severity", "schema", "table", "column", "constraint", "routine"];

function causeChain(err: Error): Error[] {
  const chain = [err];
  let next = err.cause;
  while (next instanceof Error && chain.length < MAX_CAUSES && !chain.includes(next)) {
    chain.push(next);
    next = next.cause;
  }

  return chain;
}

function cleanStack(error: Error): string {
  const stack = error.stack ?? `${error.name}: ${error.message}`;

  return stack.replace(error.message, stripQueryValues(error.message));
}

function isDatabaseError(error: Error): boolean {
  return "code" in error && typeof error.code === "string" && "severity" in error;
}

function databaseFields(chain: Error[]): Record<string, string> | undefined {
  const driverError = chain.findLast(isDatabaseError);
  if (!driverError) return undefined;

  const fields: Record<string, string> = {};
  for (const key of DATABASE_KEYS) {
    const value: unknown = Reflect.get(driverError, key);
    if (typeof value === "string") fields[key] = value;
  }

  return fields;
}

function withoutValueBearingKeys(record: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([key]) => !VALUE_BEARING_KEYS.has(key)));
}

function serializeFailure(failure: object): unknown {
  if (!("cause" in failure) || !(failure.cause instanceof Error)) return failure;

  return { ...withoutValueBearingKeys(failure), cause: serializeError(failure.cause) };
}

export function serializeError(err: unknown): unknown {
  const error = asException(err);
  if (typeof error === "object" && error !== null && !(error instanceof Error))
    return serializeFailure(error);
  if (!(error instanceof Error)) return error;

  const chain = causeChain(error);
  const database = databaseFields(chain);

  return {
    ...withoutValueBearingKeys(stdSerializers.err(error)),
    message: chain.map((link) => stripQueryValues(link.message)).join(": "),
    stack: chain.map(cleanStack).join("\ncaused by: "),
    ...(database ? { database } : {}),
  };
}

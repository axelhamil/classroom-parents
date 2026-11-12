import { DrizzleQueryError, dbOperationFailure } from "@packages/drizzle";

export const EMAIL_VALUE = "lea.parent@example.fr";
export const TOKEN_VALUE = "sealed-refresh-token-XYZ";
export const INSERT_SQL = 'insert into "account" ("email", "refresh_token") values ($1, $2)';

export function duplicateAccountQuery() {
  const driverError = Object.assign(
    new Error('duplicate key value violates unique constraint "account_email_key"'),
    {
      code: "23505",
      severity: "ERROR",
      table: "account",
      constraint: "account_email_key",
      detail: `Key (email)=(${EMAIL_VALUE}) already exists.`,
    },
  );

  return new DrizzleQueryError(INSERT_SQL, [EMAIL_VALUE, TOKEN_VALUE], driverError);
}

export function duplicateAccountFailure() {
  return dbOperationFailure("CHILD_PROVIDER_FAILURE")("create", duplicateAccountQuery());
}

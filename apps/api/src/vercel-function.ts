import { attachDatabasePool, ipAddress, waitUntil } from "@vercel/functions";
import { vercelEnv } from "./vercel-env";

Object.assign(process.env, vercelEnv(process.env));

const { createRequestDrivenApp } = await import("./request-driven");

export default await createRequestDrivenApp({
  waitUntil,
  clientAddress: (request) => ipAddress(request) ?? "",
  attachDatabasePool,
});

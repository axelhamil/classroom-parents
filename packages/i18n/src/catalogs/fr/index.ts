import admin from "./admin";
import auth from "./auth";
import common from "./common";
import emails from "./emails";
import errors from "./errors";
import settings from "./settings";

const catalog = { common, auth, errors, emails, settings, admin } as const;

export type Namespace = keyof typeof catalog;

export const NAMESPACES = Object.keys(catalog) as Namespace[];

export default catalog;

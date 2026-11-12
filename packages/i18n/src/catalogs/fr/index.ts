import admin from "./admin";
import auth from "./auth";
import children from "./children";
import common from "./common";
import emails from "./emails";
import errors from "./errors";
import eventEdit from "./event-edit";
import events from "./events";
import history from "./history";
import onboarding from "./onboarding";
import settings from "./settings";
import tour from "./tour";

const catalog = {
  common,
  auth,
  errors,
  emails,
  settings,
  admin,
  children,
  events,
  eventEdit,
  history,
  onboarding,
  tour,
} as const;

export type Namespace = keyof typeof catalog;

export const NAMESPACES = Object.keys(catalog) as Namespace[];

export default catalog;

import { agendaEvents } from "./contrib/agenda";
import { alertsEvents } from "./contrib/alerts";
import { calendarFeedEvents } from "./contrib/calendar-feed";
import { childrenEvents } from "./contrib/children";
import { rgpdEvents } from "./contrib/rgpd";
import { syncEvents } from "./contrib/sync";

export const CONTRIBUTIONS = [
  childrenEvents,
  agendaEvents,
  syncEvents,
  alertsEvents,
  rgpdEvents,
  calendarFeedEvents,
];

export const CONTRIBUTED_TYPES = {
  ...childrenEvents.types,
  ...agendaEvents.types,
  ...syncEvents.types,
  ...alertsEvents.types,
  ...rgpdEvents.types,
  ...calendarFeedEvents.types,
};

export const CONTRIBUTED_PAYLOADS = {
  ...childrenEvents.payloads,
  ...agendaEvents.payloads,
  ...syncEvents.payloads,
  ...alertsEvents.payloads,
  ...rgpdEvents.payloads,
  ...calendarFeedEvents.payloads,
};

export const CONTRIBUTED_RETENTION = {
  ...childrenEvents.retention,
  ...agendaEvents.retention,
  ...syncEvents.retention,
  ...alertsEvents.retention,
  ...rgpdEvents.retention,
  ...calendarFeedEvents.retention,
};

export const CONTRIBUTED_VISIBILITY = {
  ...childrenEvents.visibility,
  ...agendaEvents.visibility,
  ...syncEvents.visibility,
  ...alertsEvents.visibility,
  ...rgpdEvents.visibility,
  ...calendarFeedEvents.visibility,
};

export const CONTRIBUTED_DESCRIPTIONS = {
  ...childrenEvents.descriptions,
  ...agendaEvents.descriptions,
  ...syncEvents.descriptions,
  ...alertsEvents.descriptions,
  ...rgpdEvents.descriptions,
  ...calendarFeedEvents.descriptions,
};

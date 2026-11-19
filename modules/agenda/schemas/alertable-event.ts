import { and, eq, gte, isNull, lt, type SQL } from "@packages/drizzle";
import { agendaEvent } from "./event.schema";

export interface AlertableWindow {
  from: Date;
  until?: Date;
}

export function alertableEvent(window: AlertableWindow): SQL | undefined {
  return and(
    isNull(agendaEvent.deletedAt),
    isNull(agendaEvent.withdrawnAt),
    eq(agendaEvent.status, "confirmed"),
    eq(agendaEvent.done, false),
    gte(agendaEvent.deadlineAt, window.from),
    window.until ? lt(agendaEvent.deadlineAt, window.until) : undefined,
  );
}

import { and, eq, lt, not, or, type SQL } from "@packages/drizzle";
import { agendaEvent } from "./event.schema";

export interface DismissedRetention {
  dismissedBefore: Date;
  courseworkDayBefore: string;
}

export function pastEventBefore(cutoff: Date): SQL {
  return lt(agendaEvent.deadlineAt, cutoff);
}

export function dismissedEventBefore(retention: DismissedRetention): SQL | undefined {
  return and(
    or(
      lt(agendaEvent.deletedAt, retention.dismissedBefore),
      lt(agendaEvent.withdrawnAt, retention.dismissedBefore),
    ),
    or(
      not(eq(agendaEvent.source, "coursework")),
      lt(agendaEvent.deadlineDate, retention.courseworkDayBefore),
    ),
  );
}

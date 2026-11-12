import {
  alias,
  and,
  eq,
  gte,
  isNull,
  lt,
  notExists,
  type resolveExecutor,
  type SQL,
  sql,
} from "@packages/drizzle";
import { agendaEvent } from "./event.schema";

type Executor = Pick<ReturnType<typeof resolveExecutor>, "select">;

export interface AlertableWindow {
  from: Date;
  until?: Date;
}

const coursework = alias(agendaEvent, "coursework");

export function notShadowedByCoursework(exec: Executor): SQL {
  return notExists(
    exec
      .select({ id: coursework.id })
      .from(coursework)
      .where(
        and(
          sql`${agendaEvent.source} = 'announcement'`,
          sql`${coursework.source} = 'coursework'`,
          isNull(coursework.deletedAt),
          isNull(coursework.withdrawnAt),
          eq(coursework.childId, agendaEvent.childId),
          eq(coursework.courseId, agendaEvent.courseId),
          eq(coursework.deadlineDate, agendaEvent.deadlineDate),
        ),
      ),
  );
}

export function alertableEvent(exec: Executor, window: AlertableWindow): SQL | undefined {
  return and(
    isNull(agendaEvent.deletedAt),
    isNull(agendaEvent.withdrawnAt),
    eq(agendaEvent.status, "confirmed"),
    eq(agendaEvent.done, false),
    gte(agendaEvent.deadlineAt, window.from),
    window.until ? lt(agendaEvent.deadlineAt, window.until) : undefined,
    notShadowedByCoursework(exec),
  );
}

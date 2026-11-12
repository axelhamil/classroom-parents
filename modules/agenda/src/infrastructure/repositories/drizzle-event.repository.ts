import { type IInstrumentation, Option, Result } from "@packages/ddd-kit";
import {
  and,
  asc,
  dbOperationFailure,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  not,
  notInArray,
  resolveExecutor,
  type SQL,
  sql,
} from "@packages/drizzle";
import { afterTimeIdCursor, encodeTimeIdCursor, exactInstant } from "@packages/http/time-id-cursor";
import { alertableEvent, notShadowedByCoursework } from "../../../schemas/alertable-event";
import { agendaEvent } from "../../../schemas/event.schema";
import {
  type AgendaError,
  type CalendarFilter,
  type ConfirmedWindow,
  type CourseDay,
  type CourseworkCourses,
  type EventFilter,
  type EventPage,
  eventNotFound,
  type IEventRepository,
} from "../../application/ports/event-repository.port";
import { AgendaEvent } from "../../domain/event.aggregate";
import { EventId } from "../../domain/event-id";
import { EventCategory } from "../../domain/value-objects/event-category.vo";
import { EventChecklist } from "../../domain/value-objects/event-checklist.vo";
import { EventDeadline } from "../../domain/value-objects/event-deadline.vo";
import { EventDescription } from "../../domain/value-objects/event-description.vo";
import { EventSource } from "../../domain/value-objects/event-source.vo";
import { EventStatus } from "../../domain/value-objects/event-status.vo";
import { EventTitle } from "../../domain/value-objects/event-title.vo";

const dbAttrs = { "db.system.name": "postgresql" } as const;

const repositoryFailure = dbOperationFailure("EVENT_PROVIDER_FAILURE");

type EventRow = typeof agendaEvent.$inferSelect;

type Order = "asc" | "desc";

type Read = "plain" | "locked" | "chronological" | "latest";

function toDomain(row: EventRow): Result<AgendaEvent, string> {
  const id = EventId.parse(row.id);
  const title = EventTitle.create(row.title);
  const description = EventDescription.create(row.description);
  const category = EventCategory.create(row.category);
  const deadline = EventDeadline.fromComputedParisWallTime(
    row.deadlineDate,
    row.deadlineTime?.slice(0, 5),
  );
  const status = EventStatus.create(row.status);
  const source = EventSource.create(row.source);
  const checklist = EventChecklist.create(row.checklist);
  if (checklist.isFailure) return Result.fail(checklist.getError());
  if (source.isFailure) return Result.fail(source.getError());
  if (id.isFailure) return Result.fail(id.getError());
  if (title.isFailure) return Result.fail(title.getError());
  if (description.isFailure) return Result.fail(description.getError());
  if (category.isFailure) return Result.fail(category.getError());
  if (deadline.isFailure) return Result.fail(deadline.getError());
  if (status.isFailure) return Result.fail(status.getError());

  return Result.ok(
    AgendaEvent.reconstitute(
      {
        userId: row.userId,
        childId: row.childId,
        source: source.getValue(),
        announcementId: row.announcementId,
        ordinal: row.ordinal,
        courseId: Option.fromNullable(row.courseId),
        announcementUrl: Option.fromNullable(row.announcementUrl),
        title: title.getValue(),
        description: description.getValue(),
        category: category.getValue(),
        deadline: deadline.getValue(),
        receivedAt: row.receivedAt,
        status: status.getValue(),
        done: row.done,
        checklist: checklist.getValue(),
        editedAt: Option.fromNullable(row.editedAt),
        editedFields: row.editedFields,
        deletedAt: Option.fromNullable(row.deletedAt),
        withdrawnAt: Option.fromNullable(row.withdrawnAt),
        createdAt: row.createdAt,
      },
      id.getValue(),
    ),
  );
}

function mutableColumns(event: AgendaEvent) {
  const deadline = event.get("deadline").value;

  return {
    title: event.get("title").value,
    description: event.get("description").value,
    category: event.get("category").value,
    deadlineDate: deadline.date,
    deadlineTime: deadline.time ?? null,
    deadlineAt: deadline.at,
    status: event.get("status").value,
    done: event.get("done"),
    checklist: event.get("checklist").value,
    editedAt: event.get("editedAt").toNull(),
    editedFields: event.get("editedFields"),
    deletedAt: event.get("deletedAt").toNull(),
    withdrawnAt: event.get("withdrawnAt").toNull(),
  };
}

function ownedUndeleted(userId: string): SQL | undefined {
  return and(eq(agendaEvent.userId, userId), isNull(agendaEvent.deletedAt));
}

function ownedAlive(userId: string): SQL | undefined {
  return and(ownedUndeleted(userId), isNull(agendaEvent.withdrawnAt));
}

function doneIs(done: boolean | undefined): SQL | undefined {
  if (done === undefined) return undefined;

  return done ? sql`${agendaEvent.done}` : not(agendaEvent.done);
}

function filtered(
  filter: Pick<EventFilter, "childIds" | "categories" | "statuses" | "done" | "cursor">,
  order: Order,
): (SQL | undefined)[] {
  return [
    filter.childIds?.length ? inArray(agendaEvent.childId, filter.childIds) : undefined,
    filter.categories?.length ? inArray(agendaEvent.category, filter.categories) : undefined,
    filter.statuses?.length ? inArray(agendaEvent.status, filter.statuses) : undefined,
    doneIs(filter.done),
    filter.cursor
      ? afterTimeIdCursor(agendaEvent.deadlineAt, agendaEvent.id, filter.cursor, order)
      : undefined,
  ];
}

export class DrizzleEventRepository implements IEventRepository {
  constructor(private readonly instrumentation: IInstrumentation) {}

  async insertIfAbsent(event: AgendaEvent): Promise<Result<boolean, AgendaError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: "DrizzleEventRepository > insertIfAbsent" },
      async () => {
        try {
          const query = exec
            .insert(agendaEvent)
            .values({
              id: event.id.value,
              userId: event.get("userId"),
              childId: event.get("childId"),
              source: event.get("source").value,
              announcementId: event.get("announcementId"),
              ordinal: event.get("ordinal"),
              courseId: event.get("courseId").toNull(),
              announcementUrl: event.get("announcementUrl").toNull(),
              receivedAt: event.get("receivedAt"),
              createdAt: event.get("createdAt"),
              ...mutableColumns(event),
            })
            .onConflictDoNothing({
              target: [
                agendaEvent.childId,
                agendaEvent.source,
                agendaEvent.announcementId,
                agendaEvent.ordinal,
              ],
            })
            .returning({ id: agendaEvent.id });
          const inserted = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          return Result.ok(inserted.length > 0);
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(repositoryFailure("insertIfAbsent", err));
        }
      },
    );
  }

  async save(event: AgendaEvent): Promise<Result<void, AgendaError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan({ name: "DrizzleEventRepository > save" }, async () => {
      try {
        const query = exec
          .update(agendaEvent)
          .set(mutableColumns(event))
          .where(and(eq(agendaEvent.id, event.id.value), ownedUndeleted(event.get("userId"))))
          .returning({ id: agendaEvent.id });
        const updated = await this.instrumentation.startSpan(
          { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
          () => query.execute(),
        );
        if (updated.length === 0) return Result.fail(eventNotFound);

        return Result.ok();
      } catch (err) {
        this.instrumentation.capture(err);
        return Result.fail(repositoryFailure("save", err));
      }
    });
  }

  async lockCourseworkItems(
    userId: string,
    childId: string,
    courseworkIds: string[],
  ): Promise<Result<AgendaEvent[], AgendaError>> {
    if (courseworkIds.length === 0) return Result.ok([]);

    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: "DrizzleEventRepository > lockCourseworkItems" },
      async () => {
        try {
          const query = exec
            .select()
            .from(agendaEvent)
            .where(
              and(
                eq(agendaEvent.userId, userId),
                eq(agendaEvent.childId, childId),
                eq(agendaEvent.source, "coursework"),
                inArray(agendaEvent.announcementId, courseworkIds),
                eq(agendaEvent.ordinal, 0),
              ),
            )
            .orderBy(asc(agendaEvent.announcementId))
            .for("update");
          const rows = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          return this.mapRows(rows, "lockCourseworkItems");
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(repositoryFailure("lockCourseworkItems", err));
        }
      },
    );
  }

  async lockLiveCoursework(
    userId: string,
    childId: string,
    courses: CourseworkCourses,
  ): Promise<Result<AgendaEvent[], AgendaError>> {
    return this.selectMany(
      "lockLiveCoursework",
      and(
        eq(agendaEvent.userId, userId),
        eq(agendaEvent.childId, childId),
        ...("courseId" in courses
          ? [eq(agendaEvent.courseId, courses.courseId)]
          : [
              notInArray(agendaEvent.courseId, courses.outsideCourseIds),
              gte(agendaEvent.deadlineAt, courses.dueFrom),
            ]),
        sql`${agendaEvent.source} = 'coursework'`,
        isNull(agendaEvent.deletedAt),
        isNull(agendaEvent.withdrawnAt),
      ),
      "locked",
    );
  }

  async listAnnouncementsOn(
    userId: string,
    day: CourseDay,
  ): Promise<Result<AgendaEvent[], AgendaError>> {
    return this.selectMany(
      "listAnnouncementsOn",
      and(
        eq(agendaEvent.userId, userId),
        eq(agendaEvent.childId, day.childId),
        eq(agendaEvent.courseId, day.courseId),
        eq(agendaEvent.deadlineDate, day.deadlineDate),
        sql`${agendaEvent.source} = 'announcement'`,
        isNull(agendaEvent.deletedAt),
        isNull(agendaEvent.withdrawnAt),
      ),
      "plain",
    );
  }

  private async selectMany(
    method: string,
    where: SQL | undefined,
    read: Read,
    limit?: number,
  ): Promise<Result<AgendaEvent[], AgendaError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: `DrizzleEventRepository > ${method}` },
      async () => {
        try {
          const select = exec.select().from(agendaEvent).where(where).$dynamic();
          const ordered =
            read === "locked"
              ? select.for("update")
              : read === "chronological"
                ? select.orderBy(asc(agendaEvent.deadlineAt), asc(agendaEvent.id))
                : read === "latest"
                  ? select.orderBy(desc(agendaEvent.deadlineAt), desc(agendaEvent.id))
                  : select;
          const query = limit === undefined ? ordered : ordered.limit(limit);
          const rows = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          return this.mapRows(rows, method);
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(repositoryFailure(method, err));
        }
      },
    );
  }

  async listCalendar(
    userId: string,
    filter: CalendarFilter,
  ): Promise<Result<AgendaEvent[], AgendaError>> {
    const { startsAt, endsBefore } = filter.range.value;
    return this.selectMany(
      "listCalendar",
      and(
        ownedAlive(userId),
        gte(agendaEvent.deadlineAt, startsAt),
        lt(agendaEvent.deadlineAt, endsBefore),
        notShadowedByCoursework(resolveExecutor()),
        ...filtered(filter, "asc"),
      ),
      "chronological",
    );
  }

  async findOwned(
    userId: string,
    eventId: string,
  ): Promise<Result<Option<AgendaEvent>, AgendaError>> {
    return this.findOne("findOwned", userId, eventId, false);
  }

  async lockOwned(
    userId: string,
    eventId: string,
  ): Promise<Result<Option<AgendaEvent>, AgendaError>> {
    return this.findOne("lockOwned", userId, eventId, true);
  }

  async findAlertable(
    userId: string,
    eventId: string,
  ): Promise<Result<Option<AgendaEvent>, AgendaError>> {
    return this.findOne("findAlertable", userId, eventId, false, notShadowedByCoursework);
  }

  async listAlertableUpcoming(
    userId: string,
    now: Date,
    until?: Date,
  ): Promise<Result<AgendaEvent[], AgendaError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: "DrizzleEventRepository > listAlertableUpcoming" },
      async () => {
        try {
          const query = exec
            .select()
            .from(agendaEvent)
            .where(and(eq(agendaEvent.userId, userId), alertableEvent(exec, { from: now, until })))
            .orderBy(asc(agendaEvent.deadlineAt));
          const rows = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          return this.mapRows(rows, "listAlertableUpcoming");
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(repositoryFailure("listAlertableUpcoming", err));
        }
      },
    );
  }

  async listUpcoming(
    userId: string,
    filter: EventFilter,
    now: Date,
  ): Promise<Result<EventPage, AgendaError>> {
    return this.page("listUpcoming", [gte(agendaEvent.deadlineAt, now)], userId, filter, "asc");
  }

  async listHistory(
    userId: string,
    filter: EventFilter,
    now: Date,
  ): Promise<Result<EventPage, AgendaError>> {
    return this.page("listHistory", [lt(agendaEvent.deadlineAt, now)], userId, filter, "desc");
  }

  async listConfirmedSince(
    userId: string,
    childIds: string[],
    window: ConfirmedWindow,
    limit: number,
  ): Promise<Result<AgendaEvent[], AgendaError>> {
    const confirmed = () =>
      and(
        ownedAlive(userId),
        inArray(agendaEvent.childId, childIds),
        eq(agendaEvent.status, "confirmed"),
        notShadowedByCoursework(resolveExecutor()),
      );
    const upcoming = await this.selectMany(
      "listConfirmedSince",
      and(confirmed(), gte(agendaEvent.deadlineAt, window.now)),
      "chronological",
      limit,
    );
    if (upcoming.isFailure) return upcoming;

    const room = limit - upcoming.getValue().length;
    if (room <= 0) return upcoming;

    const history = await this.selectMany(
      "listConfirmedSince",
      and(
        confirmed(),
        gte(agendaEvent.deadlineAt, window.since),
        lt(agendaEvent.deadlineAt, window.now),
      ),
      "latest",
      room,
    );
    return history.map((past) => [...past.reverse(), ...upcoming.getValue()]);
  }

  private async page(
    method: string,
    window: SQL[],
    userId: string,
    filter: EventFilter,
    order: Order,
  ): Promise<Result<EventPage, AgendaError>> {
    const exec = resolveExecutor();
    const sort = order === "asc" ? asc : desc;
    return this.instrumentation.startSpan(
      { name: `DrizzleEventRepository > ${method}` },
      async () => {
        try {
          const query = exec
            .select({ row: agendaEvent, cursorAt: exactInstant(agendaEvent.deadlineAt) })
            .from(agendaEvent)
            .where(
              and(
                ownedAlive(userId),
                ...window,
                notShadowedByCoursework(exec),
                ...filtered(filter, order),
              ),
            )
            .orderBy(sort(agendaEvent.deadlineAt), sort(agendaEvent.id))
            .limit(filter.limit + 1);
          const rows = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          const shown = rows.slice(0, filter.limit);
          const last = shown.at(-1);
          const nextCursor = Option.fromNullable(rows.length > filter.limit ? last : undefined).map(
            ({ row, cursorAt }) => encodeTimeIdCursor(cursorAt, row.id),
          );
          return this.mapRows(
            shown.map(({ row }) => row),
            method,
          ).map((events) => ({ events, nextCursor }));
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(repositoryFailure(method, err));
        }
      },
    );
  }

  private async findOne(
    method: string,
    userId: string,
    eventId: string,
    lock: boolean,
    shown?: (exec: ReturnType<typeof resolveExecutor>) => SQL,
  ): Promise<Result<Option<AgendaEvent>, AgendaError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: `DrizzleEventRepository > ${method}` },
      async () => {
        try {
          const read = exec
            .select()
            .from(agendaEvent)
            .where(and(eq(agendaEvent.id, eventId), ownedAlive(userId), shown?.(exec)))
            .limit(1);
          const query = lock ? read.for("update") : read;
          const rows = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          return this.mapRows(rows, method).map((events) => Option.fromNullable(events[0]));
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(repositoryFailure(method, err));
        }
      },
    );
  }

  private mapRows(rows: EventRow[], method: string): Result<AgendaEvent[], AgendaError> {
    const events: AgendaEvent[] = [];
    for (const row of rows) {
      const mapped = toDomain(row);
      if (mapped.isFailure) {
        const corrupt = new Error(`event ${row.id}: ${mapped.getError()}`);
        this.instrumentation.capture(corrupt);
        return Result.fail(repositoryFailure(method, corrupt));
      }
      events.push(mapped.getValue());
    }
    return Result.ok(events);
  }
}

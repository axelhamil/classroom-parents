import { type IInstrumentation, Result } from "@packages/ddd-kit";
import {
  and,
  dbOperationFailure,
  eq,
  excluded,
  inArray,
  isNull,
  notInArray,
  resolveExecutor,
} from "@packages/drizzle";
import { classroomCourse } from "../../../schemas/classroom-course.schema";
import type {
  CourseName,
  CourseRef,
  ICourseRepository,
  NamedCourse,
} from "../../application/ports/course-repository.port";
import type { SyncError } from "../../application/sync-error";

const dbAttrs = { "db.system.name": "postgresql" } as const;

const repositoryFailure = dbOperationFailure("SYNC_PROVIDER_FAILURE");

const refKey = ({ childId, courseId }: CourseRef) => `${childId}\u0000${courseId}`;

export class DrizzleCourseRepository implements ICourseRepository {
  constructor(private readonly instrumentation: IInstrumentation) {}

  async recordListed(
    childId: string,
    courses: NamedCourse[],
    listedAt: Date,
  ): Promise<Result<void, SyncError>> {
    if (courses.length === 0) return Result.ok();

    return this.write("recordListed", () =>
      resolveExecutor()
        .insert(classroomCourse)
        .values(courses.map(({ courseId, name }) => ({ childId, courseId, name, listedAt })))
        .onConflictDoUpdate({
          target: [classroomCourse.childId, classroomCourse.courseId],
          set: {
            name: excluded(classroomCourse.name),
            listedAt: excluded(classroomCourse.listedAt),
            withdrawnAt: null,
          },
        }),
    );
  }

  async withdrawOutside(
    childId: string,
    activeCourseIds: string[],
    withdrawnAt: Date,
  ): Promise<Result<void, SyncError>> {
    return this.write("withdrawOutside", () =>
      resolveExecutor()
        .update(classroomCourse)
        .set({ withdrawnAt })
        .where(
          and(
            eq(classroomCourse.childId, childId),
            isNull(classroomCourse.withdrawnAt),
            activeCourseIds.length > 0
              ? notInArray(classroomCourse.courseId, activeCourseIds)
              : undefined,
          ),
        ),
    );
  }

  async namesOf(refs: CourseRef[]): Promise<Result<CourseName[], SyncError>> {
    if (refs.length === 0) return Result.ok([]);

    return this.instrumentation.startSpan(
      { name: "DrizzleCourseRepository > namesOf" },
      async () => {
        try {
          const query = resolveExecutor()
            .select({
              childId: classroomCourse.childId,
              courseId: classroomCourse.courseId,
              name: classroomCourse.name,
            })
            .from(classroomCourse)
            .where(
              and(
                inArray(classroomCourse.childId, [...new Set(refs.map(({ childId }) => childId))]),
                inArray(classroomCourse.courseId, [
                  ...new Set(refs.map(({ courseId }) => courseId)),
                ]),
              ),
            );
          const rows = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );
          const wanted = new Set(refs.map(refKey));
          return Result.ok(rows.filter((row) => wanted.has(refKey(row))));
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(repositoryFailure("namesOf", err));
        }
      },
    );
  }

  private write(
    method: string,
    build: () => { toSQL(): { sql: string }; execute(): Promise<unknown> },
  ): Promise<Result<void, SyncError>> {
    return this.instrumentation.startSpan(
      { name: `DrizzleCourseRepository > ${method}` },
      async () => {
        try {
          const query = build();
          await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );
          return Result.ok();
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(repositoryFailure(method, err));
        }
      },
    );
  }
}

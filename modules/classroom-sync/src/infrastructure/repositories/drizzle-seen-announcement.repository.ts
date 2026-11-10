import { type IInstrumentation, Result } from "@packages/ddd-kit";
import { and, dbOperationFailure, eq, inArray, resolveExecutor } from "@packages/drizzle";
import { seenAnnouncement } from "../../../schemas/seen-announcement.schema";
import type {
  ISeenAnnouncementRepository,
  LedgerEntry,
  SeenAnnouncement,
} from "../../application/ports/seen-announcement-repository.port";
import type { SyncError } from "../../application/sync-error";

const dbAttrs = { "db.system.name": "postgresql" } as const;

const repositoryFailure = dbOperationFailure("SYNC_PROVIDER_FAILURE");

export class DrizzleSeenAnnouncementRepository implements ISeenAnnouncementRepository {
  constructor(private readonly instrumentation: IInstrumentation) {}

  async findForCourse(
    childId: string,
    announcementIds: string[],
  ): Promise<Result<SeenAnnouncement[], SyncError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: "DrizzleSeenAnnouncementRepository > findForCourse" },
      async () => {
        try {
          const query = exec
            .select({
              announcementId: seenAnnouncement.announcementId,
              outcome: seenAnnouncement.outcome,
              attempts: seenAnnouncement.attempts,
            })
            .from(seenAnnouncement)
            .where(
              and(
                eq(seenAnnouncement.childId, childId),
                inArray(seenAnnouncement.announcementId, announcementIds),
              ),
            );
          const rows = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );
          return Result.ok(rows);
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(repositoryFailure("findForCourse"));
        }
      },
    );
  }

  async record(entry: LedgerEntry): Promise<Result<boolean, SyncError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: "DrizzleSeenAnnouncementRepository > record" },
      async () => {
        try {
          const query = exec
            .insert(seenAnnouncement)
            .values(entry)
            .onConflictDoUpdate({
              target: [seenAnnouncement.childId, seenAnnouncement.announcementId],
              set: {
                courseId: entry.courseId,
                outcome: entry.outcome,
                attempts: entry.attempts,
                seenAt: entry.seenAt,
              },
              setWhere: and(
                eq(seenAnnouncement.outcome, "failed"),
                eq(seenAnnouncement.attempts, entry.attempts - 1),
              ),
            })
            .returning({ announcementId: seenAnnouncement.announcementId });
          const written = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );
          return Result.ok(written.length > 0);
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(repositoryFailure("record"));
        }
      },
    );
  }
}

import type { Result } from "@packages/ddd-kit";
import type { LedgerOutcome, LedgerState } from "../../domain/announcement-ledger";
import type { SyncError } from "../sync-error";

export interface SeenAnnouncement extends LedgerState {
  announcementId: string;
}

export interface LedgerEntry {
  childId: string;
  announcementId: string;
  courseId: string;
  outcome: LedgerOutcome;
  attempts: number;
  seenAt: Date;
}

export interface ISeenAnnouncementRepository {
  findForCourse(
    childId: string,
    announcementIds: string[],
  ): Promise<Result<SeenAnnouncement[], SyncError>>;

  record(entry: LedgerEntry): Promise<Result<boolean, SyncError>>;
}

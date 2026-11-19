import type { AppError, Result } from "@packages/ddd-kit";
import type { ExtractedAmendment, ExtractedDeadline } from "./announcement-extractor.port";

export interface IngestedAnnouncement {
  id: string;
  courseId: string;
  url: string;
  publishedAt: Date;
}

export interface IngestRequest {
  userId: string;
  childId: string;
  announcement: IngestedAnnouncement;
  events: ExtractedDeadline[];
  amendments: ExtractedAmendment[];
}

export interface CourseworkDeadline {
  id: string;
  title: string;
  url: string;
  deadlineDate: string;
  deadlineTime?: string;
  done: boolean;
}

export interface CourseworkIngestRequest {
  userId: string;
  childId: string;
  courseId: string;
  items: CourseworkDeadline[];
  complete: boolean;
  presentIds: string[];
}

export interface CourseworkWithdrawRequest {
  userId: string;
  childId: string;
  activeCourseIds: string[];
}

export interface RereadRequest {
  userId: string;
  childId: string;
  announcementId: string;
  events: ExtractedDeadline[];
}

export interface RereadOutcome {
  matched: number;
  changed: number;
  unmatched: number;
}

export interface IEventIngest {
  ingest(request: IngestRequest): Promise<Result<{ created: number }, AppError>>;

  ingestCoursework(
    request: CourseworkIngestRequest,
  ): Promise<Result<{ created: number }, AppError>>;

  withdrawCourseworkOutside(
    request: CourseworkWithdrawRequest,
  ): Promise<Result<{ withdrawn: number }, AppError>>;

  previewReread(request: RereadRequest): Promise<Result<RereadOutcome, AppError>>;

  applyReread(request: RereadRequest): Promise<Result<RereadOutcome, AppError>>;
}

import type { AppError, Result } from "@packages/ddd-kit";
import type { ExtractedDeadline } from "./announcement-extractor.port";

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
}

export interface IEventIngest {
  ingest(request: IngestRequest): Promise<Result<{ created: number }, AppError>>;

  ingestCoursework(
    request: CourseworkIngestRequest,
  ): Promise<Result<{ created: number }, AppError>>;
}

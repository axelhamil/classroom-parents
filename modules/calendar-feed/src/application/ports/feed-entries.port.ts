import type { AppError, Option, Result } from "@packages/ddd-kit";

export interface FeedEntry {
  eventId: string;
  childLabel: string;
  title: string;
  description: string;
  categoryLabel: string;
  deadlineDate: string;
  deadlineTime: Option<string>;
  classroomUrl: Option<string>;
  alarmsAt: Date[];
  doneLabel: Option<string>;
}

export interface FeedEntriesRequest {
  userId: string;
  childIds: Option<string[]>;
  since: Date;
  now: Date;
}

export interface IFeedEntries {
  list(request: FeedEntriesRequest): Promise<Result<FeedEntry[], AppError>>;
}

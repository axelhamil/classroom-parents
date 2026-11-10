import type { Option, Result } from "@packages/ddd-kit";
import type { LedgerState } from "../../domain/announcement-ledger";
import type { Announcement, ClassroomError, Course, ReadScope } from "./classroom-client.port";
import type { CourseworkDeadline } from "./event-ingest.port";

export type CourseFailure =
  | "lease_lost"
  | "reconnect"
  | "school_block"
  | "misconfigured"
  | "transient";

export interface ClassroomAccess {
  token: string;
  scope: ReadScope;
}

export interface CourseList {
  courses: Course[];
  complete: boolean;
}

export interface PendingAnnouncement {
  announcement: Announcement;
  state: Option<LedgerState>;
}

export interface CourseRead {
  courseId: string;
  pending: PendingAnnouncement[];
  coursework: CourseworkDeadline[];
  courseworkComplete: boolean;
  presentIds: string[];
}

export interface IClassroomReader {
  listCourses(access: ClassroomAccess): Promise<Result<CourseList, CourseFailure>>;

  readCourse(
    childId: string,
    access: ClassroomAccess,
    course: Course,
    now: Date,
  ): Promise<Result<CourseRead, CourseFailure>>;

  profileNames(token: string): Promise<Result<string[], ClassroomError>>;
}

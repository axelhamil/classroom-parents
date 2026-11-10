import type { Option, Result } from "@packages/ddd-kit";

export type ClassroomErrorCode =
  | "CLASSROOM_UNAUTHORIZED"
  | "CLASSROOM_PERMISSION_DENIED"
  | "CLASSROOM_SCOPE_MISSING"
  | "CLASSROOM_ACCESS_NOT_CONFIGURED"
  | "CLASSROOM_RATE_LIMITED"
  | "CLASSROOM_READ_STOPPED"
  | "CLASSROOM_PROVIDER_FAILURE";

export interface ClassroomError {
  code: ClassroomErrorCode;
  message: string;
}

export type ClassroomListing = "courses" | "announcements" | "coursework" | "submissions";

export interface ReadScope {
  mayContinue(): Promise<boolean>;
  truncated(listing: ClassroomListing): void;
}

export interface Course {
  id: string;
}

export interface Announcement {
  id: string;
  courseId: string;
  text: string;
  publishedAt: Date;
  url: string;
}

export interface CourseworkDue {
  utcDate: string;
  utcTime: Option<string>;
}

export interface Coursework {
  id: string;
  courseId: string;
  title: string;
  url: string;
  due: Option<CourseworkDue>;
}

export interface IClassroomClient {
  listCourses(accessToken: string, scope: ReadScope): Promise<Result<Course[], ClassroomError>>;

  listAnnouncements(
    accessToken: string,
    courseId: string,
    since: Date,
    scope: ReadScope,
  ): Promise<Result<Announcement[], ClassroomError>>;

  listCoursework(
    accessToken: string,
    courseId: string,
    scope: ReadScope,
  ): Promise<Result<Coursework[], ClassroomError>>;

  listTurnedIn(
    accessToken: string,
    courseId: string,
    scope: ReadScope,
  ): Promise<Result<string[], ClassroomError>>;
}

import type { Result } from "@packages/ddd-kit";
import type { SyncError } from "../sync-error";

export interface NamedCourse {
  courseId: string;
  name: string;
}

export interface CourseRef {
  childId: string;
  courseId: string;
}

export interface CourseName extends CourseRef {
  name: string;
}

export interface ICourseRepository {
  recordListed(
    childId: string,
    courses: NamedCourse[],
    listedAt: Date,
  ): Promise<Result<void, SyncError>>;

  withdrawOutside(
    childId: string,
    activeCourseIds: string[],
    withdrawnAt: Date,
  ): Promise<Result<void, SyncError>>;

  namesOf(refs: CourseRef[]): Promise<Result<CourseName[], SyncError>>;
}

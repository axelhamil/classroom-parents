import type { AppError, Result } from "@packages/ddd-kit";

export interface CourseRef {
  childId: string;
  courseId: string;
}

export interface CourseName extends CourseRef {
  name: string;
}

export interface ICourseNames {
  namesOf(refs: CourseRef[]): Promise<Result<CourseName[], AppError>>;
}

import type { AppError, Result } from "@packages/ddd-kit";
import type { CourseName, CourseRef, ICourseRepository } from "../ports/course-repository.port";

export class CourseNamesService {
  constructor(private readonly courses: ICourseRepository) {}

  async namesOf(refs: CourseRef[]): Promise<Result<CourseName[], AppError>> {
    return this.courses.namesOf(refs);
  }
}

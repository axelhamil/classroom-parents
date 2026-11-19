import { type IInstrumentation, Option } from "@packages/ddd-kit";
import type { AgendaEvent } from "../../domain/event.aggregate";
import { type EventCourseDto, type EventDto, toEventDto } from "../dto/event.dto";
import type { CourseRef, ICourseNames } from "../ports/course-names.port";

type CourseLookup = (ref: CourseRef) => Option<string>;

const refKey = ({ childId, courseId }: CourseRef) => `${childId}\u0000${courseId}`;

const courseRefOf = (event: AgendaEvent): Option<CourseRef> =>
  event.get("courseId").map((courseId) => ({ childId: event.get("childId"), courseId }));

export class EventPresenter {
  constructor(
    private readonly courseNames: ICourseNames,
    private readonly instrumentation: IInstrumentation,
  ) {}

  async present(events: AgendaEvent[]): Promise<EventDto[]> {
    const refs = events.flatMap((event) =>
      courseRefOf(event)
        .map((ref) => [ref])
        .unwrapOr([]),
    );
    const nameOf = await this.courseLookup(refs);

    return events.map((event) => toEventDto(event, this.courseOf(event, nameOf)));
  }

  async presentOne(event: AgendaEvent): Promise<EventDto> {
    const [dto] = await this.present([event]);

    return dto ?? toEventDto(event, null);
  }

  private courseOf(event: AgendaEvent, nameOf: CourseLookup): EventCourseDto | null {
    return courseRefOf(event)
      .flatMap((ref) => nameOf(ref).map((name) => ({ id: ref.courseId, name })))
      .toNull();
  }

  private async courseLookup(refs: CourseRef[]): Promise<CourseLookup> {
    if (refs.length === 0) return () => Option.none();

    const unique = [...new Map(refs.map((ref) => [refKey(ref), ref])).values()];
    const names = await this.courseNames.namesOf(unique);
    if (names.isFailure) {
      this.instrumentation.capture(names.getError());
      return () => Option.none();
    }

    const byRef = new Map(names.getValue().map((course) => [refKey(course), course.name]));
    return (ref) => Option.fromNullable(byRef.get(refKey(ref)));
  }
}

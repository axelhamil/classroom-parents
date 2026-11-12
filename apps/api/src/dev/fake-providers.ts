import type { IPushSender, PushMessage } from "@modules/alerts/application/ports/push-sender.port";
import type { IGoogleOAuthClient } from "@modules/children/application/ports/google-oauth-client.port";
import type { IAnnouncementExtractor } from "@modules/classroom-sync/application/ports/announcement-extractor.port";
import type {
  ClassroomError,
  IClassroomClient,
} from "@modules/classroom-sync/application/ports/classroom-client.port";
import {
  DATASET_ANNOUNCEMENTS,
  DATASET_CHILDREN,
  DATASET_COURSES,
  DATASET_COURSEWORK,
  type DatasetChildKey,
} from "@modules/extraction/eval/classroom-dataset";
import { Option, Result } from "@packages/ddd-kit";
import { shiftDate, shiftInstant } from "@packages/ddd-kit/days";
import { requireLocalDatabase } from "@packages/test/db-check";
import { datasetShiftDays, daysBetween, demoChild, demoRefreshToken } from "./demo-dataset";

const ACCESS_PREFIX = "fake-access:";
const ACCESS_TTL_MS = 60 * 60_000;

const unauthorized: ClassroomError = {
  code: "CLASSROOM_UNAUTHORIZED",
  message: "The fake Classroom does not know this access token.",
};

const schoolBlocked: ClassroomError = {
  code: "CLASSROOM_ACCESS_NOT_CONFIGURED",
  message: "The school blocked the app in the fake Classroom.",
};

export interface FakesGuardSource {
  NODE_ENV: string;
  DATABASE_URL: string;
}

export function assertFakesAllowed(source: FakesGuardSource): void {
  if (source.NODE_ENV === "production") throw new Error("FAKE_PROVIDERS is refused in production");

  requireLocalDatabase(source.DATABASE_URL);
}

function childKeyOf(token: string, prefix: string): Option<DatasetChildKey> {
  const key = token.startsWith(prefix) ? token.slice(prefix.length) : "";

  return Option.fromNullable(DATASET_CHILDREN.find((child) => child.key === key)?.key);
}

function courseOf(courseId: string) {
  return DATASET_COURSES.find((course) => course.id === courseId);
}

export interface FakePush {
  endpoint: string;
  message: PushMessage;
  topic: string;
}

export function fakeProviders(clock: () => Date = () => new Date()) {
  const blocked = new Set<DatasetChildKey>();
  const pushes: FakePush[] = [];

  const reader = (token: string): Result<DatasetChildKey, ClassroomError> => {
    const key = childKeyOf(token, ACCESS_PREFIX);
    if (key.isNone()) return Result.fail(unauthorized);
    if (blocked.has(key.unwrap())) return Result.fail(schoolBlocked);

    return Result.ok(key.unwrap());
  };

  const ownedCourse = (token: string, courseId: string) =>
    reader(token).map((key) => courseOf(courseId)?.child === key);

  const googleOAuth: IGoogleOAuthClient = {
    refresh: async (refreshToken) => {
      const key = childKeyOf(refreshToken, "fake-refresh:");
      if (key.isNone())
        return Result.fail({ code: "CHILD_TOKEN_INVALID_GRANT", message: "Unknown fake token." });

      return Result.ok({
        accessToken: `${ACCESS_PREFIX}${key.unwrap()}`,
        expiresAt: new Date(clock().getTime() + ACCESS_TTL_MS),
        refreshToken: Option.none(),
      });
    },
    revoke: async () => Result.ok(),
    profile: async (accessToken) => {
      const key = childKeyOf(accessToken, ACCESS_PREFIX);
      if (key.isNone())
        return Result.fail({ code: "CHILD_PROVIDER_FAILURE", message: "Unknown fake token." });

      const child = demoChild(key.unwrap());
      return Result.ok({
        email: child.googleEmail,
        givenName: Option.some(child.firstName),
        picture: Option.none(),
      });
    },
  };

  const classroom: IClassroomClient = {
    profileNames: async (token) =>
      reader(token).map((key) => {
        const child = demoChild(key);
        return [child.googleName, child.firstName];
      }),
    listCourses: async (token) =>
      reader(token).map((key) =>
        DATASET_COURSES.filter((course) => course.child === key).map(({ id }) => ({ id })),
      ),
    listAnnouncements: async (token, courseId, since) => {
      const owned = ownedCourse(token, courseId);
      if (owned.isFailure) return Result.fail(owned.getError());
      if (!owned.getValue()) return Result.ok([]);

      const now = clock();
      const shift = datasetShiftDays(now);
      return Result.ok(
        DATASET_ANNOUNCEMENTS.filter((item) => item.courseId === courseId)
          .map((item) => ({
            id: item.id,
            courseId,
            text: item.text,
            publishedAt: shiftInstant(new Date(item.publishedAt), shift),
            url: `https://classroom.example/c/${courseId}/p/${item.id}`,
          }))
          .filter((item) => item.publishedAt <= now && item.publishedAt >= since),
      );
    },
    listCoursework: async (token, courseId) => {
      const owned = ownedCourse(token, courseId);
      if (owned.isFailure) return Result.fail(owned.getError());
      if (!owned.getValue()) return Result.ok([]);

      const shift = datasetShiftDays(clock());
      return Result.ok(
        DATASET_COURSEWORK.filter((work) => work.courseId === courseId).map((work) => ({
          id: work.id,
          courseId,
          title: work.title,
          url: `https://classroom.example/c/${courseId}/a/${work.id}`,
          due: Option.fromNullable(work.due).map((due) => ({
            utcDate: shiftDate(due.utcDate, shift),
            utcTime: Option.fromNullable(due.utcTime),
          })),
        })),
      );
    },
    listTurnedIn: async (token, courseId) => {
      const owned = ownedCourse(token, courseId);
      if (owned.isFailure) return Result.fail(owned.getError());

      return Result.ok(
        DATASET_COURSEWORK.filter((work) => owned.getValue() && work.courseId === courseId)
          .filter((work) => work.turnedIn)
          .map((work) => work.id),
      );
    },
  };

  const extractor: IAnnouncementExtractor = {
    extract: async (request) => {
      const known = DATASET_ANNOUNCEMENTS.find((item) => item.text === request.text);
      if (!known) return Result.ok([]);

      const shift = daysBetween(new Date(known.publishedAt), request.publishedAt);
      return Result.ok(
        known.expected.map((event) => ({
          title: event.title,
          description: event.description,
          category: event.category,
          deadlineDate: shiftDate(event.deadlineDate, shift),
          ...(event.deadlineTime === undefined ? {} : { deadlineTime: event.deadlineTime }),
          needsReview: event.needsReview ?? false,
        })),
      );
    },
  };

  const push: IPushSender = {
    send: async (target, message, options) => {
      pushes.push({ endpoint: target.endpoint, message, topic: options.topic });
      return Result.ok();
    },
  };

  return {
    googleOAuth,
    classroom,
    extractor,
    push,
    pushed: (): readonly FakePush[] => pushes,
    refreshTokenOf: demoRefreshToken,
    blockSchool: (key: DatasetChildKey) => blocked.add(key),
    unblockSchool: (key: DatasetChildKey) => blocked.delete(key),
  };
}

export type FakeProviders = ReturnType<typeof fakeProviders>;

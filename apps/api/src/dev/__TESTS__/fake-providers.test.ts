import { describe, expect, it } from "bun:test";
import { DATASET_ANNOUNCEMENTS } from "@modules/extraction/eval/classroom-dataset";
import { shiftInstant } from "@packages/ddd-kit/days";
import { assertFakesAllowed, fakeProviders } from "../fake-providers";

const LOCAL_DB = "postgres://postgres:postgres@localhost:54329/classroom_parents_demo";
const scope = { mayContinue: async () => true, truncated: () => {} };
const NOW = new Date("2026-11-10T10:00:00Z");

function providers() {
  return fakeProviders(() => NOW);
}

async function accessTokenFor(child: "lea" | "hugo") {
  const fakes = providers();
  const access = await fakes.googleOAuth.refresh(fakes.refreshTokenOf(child));

  return { fakes, token: access.getValue().accessToken };
}

describe("fake providers guard", () => {
  it("refuses production and any database but the local one", () => {
    expect(() => assertFakesAllowed({ NODE_ENV: "production", DATABASE_URL: LOCAL_DB })).toThrow();
    expect(() =>
      assertFakesAllowed({ NODE_ENV: "development", DATABASE_URL: "postgres://db.example:5432/x" }),
    ).toThrow();
    expect(() =>
      assertFakesAllowed({ NODE_ENV: "development", DATABASE_URL: LOCAL_DB }),
    ).not.toThrow();
  });
});

describe("fake Google OAuth", () => {
  it("resolves the dataset child behind a refresh token", async () => {
    const { fakes, token } = await accessTokenFor("lea");

    const profile = await fakes.googleOAuth.profile(token);

    expect(profile.getValue().email).toBe("lea.demo@eleve.example");
  });
});

describe("fake Classroom", () => {
  it("lists only the courses of the child behind the token", async () => {
    const { fakes, token } = await accessTokenFor("lea");

    const courses = await fakes.classroom.listCourses(token, scope);

    expect(courses.getValue().map((course) => course.id)).toEqual(["lea-cm2", "lea-anglais"]);
  });

  it("serves announcements already published, moved to the current week", async () => {
    const { fakes, token } = await accessTokenFor("hugo");

    const listed = await fakes.classroom.listAnnouncements(token, "hugo-maths", new Date(0), scope);
    const published = listed.getValue();

    expect(published.length).toBeGreaterThan(0);
    expect(published.every((item) => item.publishedAt.getTime() <= NOW.getTime())).toBe(true);
    expect(published.map((item) => item.id)).toContain("first-hour-test");
  });

  it("answers access not configured once the school blocks the app", async () => {
    const { fakes, token } = await accessTokenFor("hugo");

    fakes.blockSchool("hugo");
    const courses = await fakes.classroom.listCourses(token, scope);

    expect(courses.isFailure && courses.getError().code).toBe("CLASSROOM_ACCESS_NOT_CONFIGURED");
  });

  it("reads the Google names of the child behind the token, so the extractor can mask them", async () => {
    const { fakes, token } = await accessTokenFor("lea");

    const names = await fakes.classroom.profileNames(token);

    expect(names.getValue()).toEqual(["Léa Martin", "Léa"]);
  });

  it("marks turned-in coursework", async () => {
    const { fakes, token } = await accessTokenFor("hugo");

    const turnedIn = await fakes.classroom.listTurnedIn(token, "hugo-maths", scope);

    expect(turnedIn.getValue()).toEqual(["w-dm2"]);
  });
});

describe("fake extractor", () => {
  it("returns the expected deadlines moved by the publication shift", async () => {
    const fakes = providers();
    const trip = DATASET_ANNOUNCEMENTS.find((item) => item.id === "trip-and-authorisation");
    if (!trip) throw new Error("dataset lost its trip announcement");

    const sameDay = await fakes.extractor.extract({
      text: trip.text,
      publishedAt: new Date(trip.publishedAt),
      childNames: [],
    });
    const weekLater = await fakes.extractor.extract({
      text: trip.text,
      publishedAt: shiftInstant(new Date(trip.publishedAt), 7),
      childNames: [],
    });

    expect(sameDay.getValue().map((event) => event.deadlineDate)).toEqual([
      "2026-12-01",
      "2026-11-20",
    ]);
    expect(weekLater.getValue().map((event) => event.deadlineDate)).toEqual([
      "2026-12-08",
      "2026-11-27",
    ]);
  });

  it("finds no deadline in an unknown text", async () => {
    const extracted = await providers().extractor.extract({
      text: "Bonjour",
      publishedAt: NOW,
      childNames: [],
    });

    expect(extracted.getValue()).toEqual([]);
  });
});

describe("fake push sink", () => {
  it("accepts every push and keeps it for the checks to read", async () => {
    const fakes = providers();
    const target = { endpoint: "https://fcm.googleapis.com/fcm/send/demo", p256dh: "k", auth: "a" };
    const message = {
      title: "Contrôle",
      body: "jeudi",
      url: "https://app/events/1",
      tag: "event-1",
    };
    const options = { ttlSeconds: 7200, topic: "event1", urgency: "high" as const };

    const sent = await fakes.push.send(target, message, options);

    expect(sent.isSuccess).toBe(true);
    expect(fakes.pushed()).toEqual([{ endpoint: target.endpoint, message, options }]);
  });
});

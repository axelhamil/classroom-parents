import { describe, expect, it } from "bun:test";
import {
  type AnnouncementPlan,
  applyLifeStep,
  type ClassroomGateway,
  type CourseworkPlan,
  type DuePlan,
  planClass,
  planLifeStep,
  provision,
  type RemoteAnnouncement,
  type RemoteCourse,
  type RemoteCoursework,
  readConfig,
} from "../provision-test-classroom";
import { CLASS_TEMPLATE, type ClassTemplate } from "../test-classroom-template";

const DOMAIN = "gedu.demo.example.org";
const ANCHOR = "2026-11-16";
const BEFORE_ANCHOR = new Date("2026-11-15T12:00:00Z");
const REPO_ROOT = "/repo";

const ENV = {
  TEST_CLASSROOM_DOMAIN: DOMAIN,
  TEST_CLASSROOM_ALLOWED_DOMAINS: `other.example, ${DOMAIN}`,
  TEST_CLASSROOM_ANCHOR: ANCHOR,
  TEST_CLASSROOM_SERVICE_ACCOUNT_FILE: "/home/someone/secrets/test-classroom.json",
};

interface FakeCourse extends RemoteCourse {
  owner: string;
  students: Set<string>;
  invitations: Map<string, string>;
  announcements: RemoteAnnouncement[];
  coursework: RemoteCoursework[];
}

class FakeClassroom implements ClassroomGateway {
  readonly courses: FakeCourse[] = [];
  private nextId = 1;

  private id(): string {
    this.nextId += 1;

    return String(this.nextId);
  }

  private course(as: string, courseId: string): FakeCourse {
    const course = this.courses.find((candidate) => candidate.id === courseId);
    if (!course || course.owner !== as) throw new Error(`${as} does not teach ${courseId}`);

    return course;
  }

  async listCourses(as: string): Promise<RemoteCourse[]> {
    return this.courses.filter((course) => course.owner === as);
  }

  async createCourse(
    as: string,
    course: { name: string; section: string; description: string },
  ): Promise<RemoteCourse> {
    const created: FakeCourse = {
      ...course,
      id: this.id(),
      courseState: "ACTIVE",
      owner: as,
      students: new Set(),
      invitations: new Map(),
      announcements: [],
      coursework: [],
    };
    this.courses.push(created);

    return created;
  }

  async activateCourse(as: string, courseId: string): Promise<void> {
    this.course(as, courseId).courseState = "ACTIVE";
  }

  async isStudent(as: string, courseId: string, email: string): Promise<boolean> {
    return this.course(as, courseId).students.has(email);
  }

  async pendingInvitation(as: string, courseId: string, email: string) {
    return this.course(as, courseId).invitations.get(email);
  }

  async invite(as: string, courseId: string, email: string): Promise<string> {
    const invitationId = this.id();
    this.course(as, courseId).invitations.set(email, invitationId);

    return invitationId;
  }

  async acceptInvitation(as: string, invitationId: string): Promise<void> {
    const course = this.courses.find((candidate) => candidate.invitations.get(as) === invitationId);
    if (!course) throw new Error(`${as} has no invitation ${invitationId}`);

    course.invitations.delete(as);
    course.students.add(as);
  }

  async listAnnouncements(as: string, courseId: string): Promise<RemoteAnnouncement[]> {
    return this.course(as, courseId).announcements;
  }

  async createAnnouncement(as: string, courseId: string, plan: AnnouncementPlan): Promise<void> {
    this.course(as, courseId).announcements.push({ id: this.id(), text: plan.text });
  }

  async editAnnouncement(as: string, courseId: string, id: string, text: string): Promise<void> {
    const announcement = this.course(as, courseId).announcements.find((a) => a.id === id);
    if (!announcement) throw new Error(`no announcement ${id}`);

    announcement.text = text;
  }

  async listCoursework(as: string, courseId: string): Promise<RemoteCoursework[]> {
    return this.course(as, courseId).coursework;
  }

  async createCoursework(as: string, courseId: string, plan: CourseworkPlan): Promise<void> {
    this.course(as, courseId).coursework.push({ id: this.id(), title: plan.title, due: plan.due });
  }

  async moveCoursework(as: string, courseId: string, id: string, due: DuePlan): Promise<void> {
    const work = this.course(as, courseId).coursework.find((candidate) => candidate.id === id);
    if (!work) throw new Error(`no coursework ${id}`);

    work.due = due;
  }

  async removeCoursework(as: string, courseId: string, id: string): Promise<void> {
    const course = this.course(as, courseId);
    course.coursework = course.coursework.filter((candidate) => candidate.id !== id);
  }
}

const plan = (now = BEFORE_ANCHOR) =>
  planClass(CLASS_TEMPLATE, { domain: DOMAIN, anchor: ANCHOR, now });

const courseNamed = (fake: FakeClassroom, fragment: string): FakeCourse => {
  const course = fake.courses.find((candidate) => candidate.name.includes(fragment));
  if (!course) throw new Error(`no course ${fragment}`);

  return course;
};

describe("provision-test-classroom config", () => {
  it("runs on a demo domain that the allow list names", () => {
    const result = readConfig(ENV, { dryRun: false, repoRoot: REPO_ROOT });

    expect(result).toEqual({
      ok: true,
      config: { domain: DOMAIN, anchor: ANCHOR, keyFile: ENV.TEST_CLASSROOM_SERVICE_ACCOUNT_FILE },
    });
  });

  it("refuses a domain that the allow list does not name", () => {
    const result = readConfig(
      { ...ENV, TEST_CLASSROOM_DOMAIN: "real-school.example" },
      { dryRun: false, repoRoot: REPO_ROOT },
    );

    expect(result.ok).toBe(false);
  });

  it("refuses to run without an allow list rather than trusting any domain", () => {
    const result = readConfig(
      { ...ENV, TEST_CLASSROOM_ALLOWED_DOMAINS: "" },
      { dryRun: true, repoRoot: REPO_ROOT },
    );

    expect(result).toEqual({ ok: false, error: expect.stringContaining("TEST_CLASSROOM_ALLOWED") });
  });

  it("refuses an anchor that is not a Monday, since the texts name weekdays from it", () => {
    const result = readConfig(
      { ...ENV, TEST_CLASSROOM_ANCHOR: "2026-11-17" },
      { dryRun: true, repoRoot: REPO_ROOT },
    );

    expect(result).toEqual({ ok: false, error: expect.stringContaining("Monday") });
  });

  it("refuses a service account key stored inside the repository", () => {
    const result = readConfig(
      { ...ENV, TEST_CLASSROOM_SERVICE_ACCOUNT_FILE: `${REPO_ROOT}/secrets/key.json` },
      { dryRun: false, repoRoot: REPO_ROOT },
    );

    expect(result).toEqual({ ok: false, error: expect.stringContaining("outside") });
  });

  it("plans a dry run without any credential", () => {
    const { TEST_CLASSROOM_SERVICE_ACCOUNT_FILE: _key, ...withoutKey } = ENV;

    expect(readConfig(withoutKey, { dryRun: true, repoRoot: REPO_ROOT }).ok).toBe(true);
    expect(readConfig(withoutKey, { dryRun: false, repoRoot: REPO_ROOT }).ok).toBe(false);
  });
});

describe("provision-test-classroom plan", () => {
  it("names every course with the test prefix and gives it the teacher of the demo domain", () => {
    const courses = plan().courses;

    expect(courses).toHaveLength(6);
    expect(courses.every((course) => course.name.startsWith("[TEST] "))).toBe(true);
    expect(courses.map((course) => course.owner)).toContain(`prof.maths@${DOMAIN}`);
    expect(courses[0]?.students).toEqual([`eleve.jade@${DOMAIN}`, `eleve.noe@${DOMAIN}`]);
  });

  it("refuses a template course without the test prefix", () => {
    const [first, ...others] = CLASS_TEMPLATE.courses;
    if (!first) throw new Error("empty template");
    const unsafe: ClassTemplate = {
      ...CLASS_TEMPLATE,
      courses: [{ ...first, name: "Mathématiques 4e B" }, ...others],
    };

    expect(() => planClass(unsafe, { domain: DOMAIN, anchor: ANCHOR, now: BEFORE_ANCHOR })).toThrow(
      "[TEST]",
    );
  });

  it("writes the dates of the texts from the anchor, in French", () => {
    const histoire = plan().courses.find((course) => course.name.includes("Histoire"));

    expect(histoire?.announcements[0]?.text).toBe(
      "Sortie au musée d'histoire de la ville mercredi 9 décembre. L'autorisation signée et la participation de 8 euros sont à rendre avant vendredi 27 novembre.",
    );
  });

  it("converts a due time in Paris to the UTC date and time Classroom stores", () => {
    const anglais = plan().courses.find((course) => course.name.includes("Anglais"));

    expect(anglais?.coursework[0]?.due).toEqual({
      date: { year: 2026, month: 11, day: 26 },
      time: { hours: 7, minutes: 0 },
    });
  });

  it("closes a coursework given without time at the end of the Paris day, as the Classroom UI does", () => {
    const eps = plan().courses.find((course) => course.name.includes("EPS"));

    expect(eps?.coursework[0]?.due).toEqual({
      date: { year: 2026, month: 12, day: 13 },
      time: { hours: 22, minutes: 59 },
    });
  });

  it("leaves a coursework without due date undated", () => {
    const svt = plan().courses.find((course) => course.name.includes("SVT"));

    expect(svt?.coursework[0]?.due).toBeUndefined();
  });

  it("schedules what the template publishes later and publishes the past at once", () => {
    const maths = plan(new Date("2026-11-30T12:00:00Z")).courses.find((course) =>
      course.name.includes("Mathématiques"),
    );

    expect(maths?.announcements[0]).toMatchObject({ state: "PUBLISHED" });
    expect(maths?.announcements.at(-1)).toMatchObject({
      state: "DRAFT",
      scheduledTime: "2026-12-09T16:00:00.000Z",
    });
  });
});

describe("provision-test-classroom provisioning", () => {
  it("creates the courses, enrolls both pupils and publishes the template", async () => {
    const fake = new FakeClassroom();
    const classPlan = plan();

    await provision(classPlan, fake);

    expect(fake.courses).toHaveLength(6);
    expect(fake.courses.every((course) => course.students.size === 2)).toBe(true);
    expect(fake.courses.flatMap((course) => course.announcements)).toHaveLength(
      CLASS_TEMPLATE.announcements.length,
    );
    expect(fake.courses.flatMap((course) => course.coursework)).toHaveLength(
      CLASS_TEMPLATE.coursework.length,
    );
  });

  it("writes nothing on a second run", async () => {
    const fake = new FakeClassroom();
    await provision(plan(), fake);

    const writes = await provision(plan(), fake);

    expect(writes).toEqual([]);
  });

  it("activates a course left provisioned and accepts a pending invitation", async () => {
    const fake = new FakeClassroom();
    await provision(plan(), fake);
    const maths = courseNamed(fake, "Mathématiques");
    maths.courseState = "PROVISIONED";
    maths.students.delete(`eleve.noe@${DOMAIN}`);
    maths.invitations.set(`eleve.noe@${DOMAIN}`, "pending");

    const writes = await provision(plan(), fake);

    expect(maths.courseState).toBe("ACTIVE");
    expect(maths.students.has(`eleve.noe@${DOMAIN}`)).toBe(true);
    expect(writes).toHaveLength(2);
  });

  it("refuses to republish a course provisioned from another anchor", async () => {
    const fake = new FakeClassroom();
    await provision(plan(), fake);
    const shifted = planClass(CLASS_TEMPLATE, {
      domain: DOMAIN,
      anchor: "2026-11-23",
      now: BEFORE_ANCHOR,
    });

    await expect(provision(shifted, fake)).rejects.toThrow(ANCHOR);
  });
});

describe("provision-test-classroom life steps", () => {
  const life = (step: number) =>
    planLifeStep(CLASS_TEMPLATE, step, { domain: DOMAIN, anchor: ANCHOR });

  it("publishes a correction and moves the coursework it concerns", async () => {
    const fake = new FakeClassroom();
    await provision(plan(), fake);

    await applyLifeStep(life(1), fake);

    const maths = courseNamed(fake, "Mathématiques");
    expect(maths.announcements.at(-1)?.text).toBe(
      "Rectificatif : le contrôle de mathématiques du jeudi 10 décembre est déplacé au vendredi 11 décembre.",
    );
    expect(maths.coursework.find((work) => work.title === "DM n°4")?.due).toEqual({
      date: { year: 2026, month: 12, day: 17 },
      time: { hours: 7, minutes: 0 },
    });
  });

  it("removes the withdrawn coursework", async () => {
    const fake = new FakeClassroom();
    await provision(plan(), fake);

    await applyLifeStep(life(3), fake);

    const titles = courseNamed(fake, "Français").coursework.map((work) => work.title);
    expect(titles).not.toContain("Questionnaire de lecture");
  });

  it("edits an announcement in place instead of posting a new one", async () => {
    const fake = new FakeClassroom();
    await provision(plan(), fake);

    await applyLifeStep(life(4), fake);

    const eps = courseNamed(fake, "EPS");
    expect(eps.announcements.map((announcement) => announcement.text)).toContain(
      "Course d'orientation au parc reportée au vendredi 18 décembre : tenue de sport et gourde obligatoires.",
    );
    expect(eps.announcements).toHaveLength(
      CLASS_TEMPLATE.announcements.filter((announcement) => announcement.course === "eps").length,
    );
  });

  it("writes nothing when a step is replayed", async () => {
    const fake = new FakeClassroom();
    await provision(plan(), fake);
    for (const step of [1, 2, 3, 4]) await applyLifeStep(life(step), fake);

    const replays = await Promise.all([1, 2, 3, 4].map((step) => applyLifeStep(life(step), fake)));

    expect(replays.flat()).toEqual([]);
  });

  it("refuses a step the template does not define", () => {
    expect(() => life(9)).toThrow("step 9");
  });
});

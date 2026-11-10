import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { shiftInstant } from "@packages/ddd-kit/days";
import { zonedWallTimeToUtc } from "@packages/ddd-kit/zoned-time";
import {
  CLASS_TEMPLATE,
  type ClassTemplate,
  type DayWords,
  type LifeAction,
  type TemplateDue,
  type TemplateText,
} from "./test-classroom-template";

const SCHOOL_TIME_ZONE = "Europe/Paris";
const UNTIMED_DUE = "23:59";
const MONDAY = 1;
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CLASSROOM_API = "https://classroom.googleapis.com/v1";
const TOKEN_LIFETIME_S = 3600;

export const PROVISIONING_SCOPES = [
  "https://www.googleapis.com/auth/classroom.courses",
  "https://www.googleapis.com/auth/classroom.rosters",
  "https://www.googleapis.com/auth/classroom.announcements",
  "https://www.googleapis.com/auth/classroom.coursework.students",
] as const;

export interface ProvisionConfig {
  domain: string;
  anchor: string;
  keyFile: string | undefined;
}

type ConfigResult = { ok: true; config: ProvisionConfig } | { ok: false; error: string };

export interface DuePlan {
  date: { year: number; month: number; day: number };
  time: { hours: number; minutes: number };
}

type PostState = { state: "PUBLISHED" } | { state: "DRAFT"; scheduledTime: string };

export type AnnouncementPlan = { key: string; text: string } & PostState;

export type CourseworkPlan = {
  key: string;
  title: string;
  description: string;
  due: DuePlan | undefined;
} & PostState;

export interface CoursePlan {
  owner: string;
  name: string;
  section: string;
  description: string;
  students: string[];
  announcements: AnnouncementPlan[];
  coursework: CourseworkPlan[];
}

export interface ClassPlan {
  courses: CoursePlan[];
}

export interface RemoteCourse {
  id: string;
  name: string;
  description: string;
  courseState: string;
}

export interface RemoteAnnouncement {
  id: string;
  text: string;
}

export interface RemoteCoursework {
  id: string;
  title: string;
  due: DuePlan | undefined;
}

export interface ClassroomGateway {
  listCourses(as: string): Promise<RemoteCourse[]>;
  createCourse(
    as: string,
    course: { name: string; section: string; description: string },
  ): Promise<RemoteCourse>;
  activateCourse(as: string, courseId: string): Promise<void>;
  isStudent(as: string, courseId: string, email: string): Promise<boolean>;
  pendingInvitation(as: string, courseId: string, email: string): Promise<string | undefined>;
  invite(as: string, courseId: string, email: string): Promise<string>;
  acceptInvitation(as: string, invitationId: string): Promise<void>;
  listAnnouncements(as: string, courseId: string): Promise<RemoteAnnouncement[]>;
  createAnnouncement(as: string, courseId: string, announcement: AnnouncementPlan): Promise<void>;
  editAnnouncement(as: string, courseId: string, id: string, text: string): Promise<void>;
  listCoursework(as: string, courseId: string): Promise<RemoteCoursework[]>;
  createCoursework(as: string, courseId: string, coursework: CourseworkPlan): Promise<void>;
  moveCoursework(as: string, courseId: string, id: string, due: DuePlan): Promise<void>;
  removeCoursework(as: string, courseId: string, id: string): Promise<void>;
}

export type LifeActionPlan = { owner: string; course: string } & (
  | { kind: "announce"; text: string }
  | { kind: "edit-announcement"; from: string; to: string }
  | { kind: "move-coursework"; title: string; due: DuePlan }
  | { kind: "remove-coursework"; title: string }
);

interface DateContext {
  domain: string;
  anchor: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function listOfDomains(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean);
}

function isMonday(date: string): boolean {
  const day = new Date(`${date}T00:00:00Z`);

  return ISO_DATE.test(date) && !Number.isNaN(day.getTime()) && day.getUTCDay() === MONDAY;
}

function isInside(path: string, root: string): boolean {
  const fromRoot = relative(resolve(root), resolve(path));

  return !fromRoot.startsWith("..") && !isAbsolute(fromRoot);
}

export function readConfig(
  env: Record<string, string | undefined>,
  { dryRun, repoRoot }: { dryRun: boolean; repoRoot: string },
): ConfigResult {
  const domain = env.TEST_CLASSROOM_DOMAIN?.trim().toLowerCase() ?? "";
  const allowed = listOfDomains(env.TEST_CLASSROOM_ALLOWED_DOMAINS);
  const anchor = env.TEST_CLASSROOM_ANCHOR?.trim() ?? "";
  const keyFile = env.TEST_CLASSROOM_SERVICE_ACCOUNT_FILE?.trim() || undefined;

  if (allowed.length === 0)
    return { ok: false, error: "set TEST_CLASSROOM_ALLOWED_DOMAINS to the demo domains" };
  if (!allowed.includes(domain))
    return {
      ok: false,
      error: `TEST_CLASSROOM_DOMAIN "${domain}" is not in TEST_CLASSROOM_ALLOWED_DOMAINS`,
    };
  if (!isMonday(anchor))
    return { ok: false, error: `TEST_CLASSROOM_ANCHOR "${anchor}" must be a Monday (YYYY-MM-DD)` };
  if (!dryRun && keyFile === undefined)
    return { ok: false, error: "set TEST_CLASSROOM_SERVICE_ACCOUNT_FILE to the service key" };
  if (keyFile !== undefined && isInside(keyFile, repoRoot))
    return { ok: false, error: "keep the service account key outside the repository" };

  return { ok: true, config: { domain, anchor, keyFile } };
}

function dayOf(anchor: string, day: number): Date {
  return shiftInstant(new Date(`${anchor}T00:00:00Z`), day);
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

const FRENCH_DAY = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

function frenchDayWords(anchor: string): DayWords {
  return (day) => {
    const date = dayOf(anchor, day);
    const words = FRENCH_DAY.format(date);

    return date.getUTCDate() === 1 ? words.replace(/ 1 /, " 1er ") : words;
  };
}

function render(text: TemplateText, anchor: string): string {
  return typeof text === "string" ? text : text(frenchDayWords(anchor));
}

function parisInstant(anchor: string, day: number, time: string): Date {
  const instant = zonedWallTimeToUtc(isoDay(dayOf(anchor, day)), time, SCHOOL_TIME_ZONE);
  if (instant.isFailure)
    throw new Error(`day ${day} ${time} is no Paris time: ${instant.getError()}`);

  return instant.getValue();
}

function duePlan(anchor: string, due: TemplateDue): DuePlan {
  const instant = parisInstant(anchor, due.day, due.time ?? UNTIMED_DUE);

  return {
    date: {
      year: instant.getUTCFullYear(),
      month: instant.getUTCMonth() + 1,
      day: instant.getUTCDate(),
    },
    time: { hours: instant.getUTCHours(), minutes: instant.getUTCMinutes() },
  };
}

function postState(anchor: string, day: number, time: string, now: Date): PostState {
  const at = parisInstant(anchor, day, time);

  return at > now ? { state: "DRAFT", scheduledTime: at.toISOString() } : { state: "PUBLISHED" };
}

function templateMarker(template: ClassTemplate, anchor: string): string {
  return `classroom-parents test template v${template.version}, anchor ${anchor}`;
}

const email = (localPart: string, domain: string): string => `${localPart}@${domain}`;

export function planClass(
  template: ClassTemplate,
  { domain, anchor, now }: DateContext & { now: Date },
): ClassPlan {
  const unsafe = template.courses.find((course) => !course.name.startsWith(`${template.prefix} `));
  if (unsafe) throw new Error(`course "${unsafe.name}" does not start with "${template.prefix}"`);

  return {
    courses: template.courses.map((course) => ({
      owner: email(course.teacher.localPart, domain),
      name: course.name,
      section: course.section,
      description: templateMarker(template, anchor),
      students: template.students.map((student) => email(student.localPart, domain)),
      announcements: template.announcements
        .filter((announcement) => announcement.course === course.key)
        .map((announcement) => ({
          key: announcement.key,
          text: render(announcement.text, anchor),
          ...postState(anchor, announcement.day, announcement.time, now),
        })),
      coursework: template.coursework
        .filter((work) => work.course === course.key)
        .map((work) => ({
          key: work.key,
          title: work.title,
          description: work.description,
          due: work.due && duePlan(anchor, work.due),
          ...postState(anchor, work.day, work.time, now),
        })),
    })),
  };
}

interface TemplateLookup {
  courseOf(key: string): { owner: string; course: string };
  announcementOf(key: string): ClassTemplate["announcements"][number];
  courseworkOf(key: string): ClassTemplate["coursework"][number];
}

function templateLookup(template: ClassTemplate, step: number, domain: string): TemplateLookup {
  const found = <T>(item: T | undefined, what: string): T => {
    if (item === undefined) throw new Error(`life step ${step} names no ${what}`);

    return item;
  };

  return {
    courseOf(key) {
      const course = found(
        template.courses.find((candidate) => candidate.key === key),
        `course ${key}`,
      );

      return { owner: email(course.teacher.localPart, domain), course: course.name };
    },
    announcementOf: (key) =>
      found(
        template.announcements.find((candidate) => candidate.key === key),
        `announcement ${key}`,
      ),
    courseworkOf: (key) =>
      found(
        template.coursework.find((candidate) => candidate.key === key),
        `coursework ${key}`,
      ),
  };
}

function planLifeAction(
  action: LifeAction,
  lookup: TemplateLookup,
  anchor: string,
): LifeActionPlan {
  switch (action.kind) {
    case "announce":
      return {
        ...lookup.courseOf(action.course),
        kind: action.kind,
        text: render(action.text, anchor),
      };
    case "edit-announcement": {
      const announcement = lookup.announcementOf(action.announcement);

      return {
        ...lookup.courseOf(announcement.course),
        kind: action.kind,
        from: render(announcement.text, anchor),
        to: render(action.text, anchor),
      };
    }
    case "move-coursework": {
      const work = lookup.courseworkOf(action.coursework);

      return {
        ...lookup.courseOf(work.course),
        kind: action.kind,
        title: work.title,
        due: duePlan(anchor, action.due),
      };
    }
    case "remove-coursework": {
      const work = lookup.courseworkOf(action.coursework);

      return { ...lookup.courseOf(work.course), kind: action.kind, title: work.title };
    }
  }
}

export function planLifeStep(
  template: ClassTemplate,
  step: number,
  { domain, anchor }: DateContext,
): LifeActionPlan[] {
  const life = template.life.find((candidate) => candidate.step === step);
  if (!life) throw new Error(`the template has no life step ${step}`);

  const lookup = templateLookup(template, step, domain);

  return life.actions.map((action) => planLifeAction(action, lookup, anchor));
}

const sameText = (text: string): string => text.trim().replace(/\s+/g, " ");

const sameDue = (left: DuePlan | undefined, right: DuePlan): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

async function findCourse(
  gateway: ClassroomGateway,
  owner: string,
  name: string,
): Promise<RemoteCourse | undefined> {
  const courses = await gateway.listCourses(owner);

  return courses.find((course) => course.name === name);
}

async function ensureCourse(
  gateway: ClassroomGateway,
  course: CoursePlan,
  writes: string[],
): Promise<RemoteCourse> {
  const existing = await findCourse(gateway, course.owner, course.name);
  if (existing === undefined) {
    writes.push(`create course ${course.name}`);

    return gateway.createCourse(course.owner, course);
  }

  if (existing.description !== course.description) {
    throw new Error(
      `refused: "${course.name}" carries "${existing.description}", not "${course.description}"; rerun with the anchor it was provisioned from or archive it`,
    );
  }

  if (existing.courseState !== "ACTIVE") {
    writes.push(`activate course ${course.name}`);
    await gateway.activateCourse(course.owner, existing.id);
  }

  return existing;
}

async function ensureStudent(
  gateway: ClassroomGateway,
  course: CoursePlan,
  courseId: string,
  student: string,
  writes: string[],
): Promise<void> {
  if (await gateway.isStudent(course.owner, courseId, student)) return;

  const pending = await gateway.pendingInvitation(course.owner, courseId, student);
  if (pending === undefined) writes.push(`invite ${student} to ${course.name}`);
  const invitationId = pending ?? (await gateway.invite(course.owner, courseId, student));

  writes.push(`enroll ${student} in ${course.name}`);
  await gateway.acceptInvitation(student, invitationId);
}

export async function provision(plan: ClassPlan, gateway: ClassroomGateway): Promise<string[]> {
  const writes: string[] = [];

  for (const course of plan.courses) {
    const remote = await ensureCourse(gateway, course, writes);

    for (const student of course.students) {
      await ensureStudent(gateway, course, remote.id, student, writes);
    }

    const published = new Set(
      (await gateway.listAnnouncements(course.owner, remote.id)).map(({ text }) => sameText(text)),
    );
    for (const announcement of course.announcements) {
      if (published.has(sameText(announcement.text))) continue;

      writes.push(`announce ${announcement.key} in ${course.name}`);
      await gateway.createAnnouncement(course.owner, remote.id, announcement);
    }

    const assigned = new Set(
      (await gateway.listCoursework(course.owner, remote.id)).map(({ title }) => title),
    );
    for (const work of course.coursework) {
      if (assigned.has(work.title)) continue;

      writes.push(`assign ${work.key} in ${course.name}`);
      await gateway.createCoursework(course.owner, remote.id, work);
    }
  }

  return writes;
}

async function applyAction(
  gateway: ClassroomGateway,
  action: LifeActionPlan,
  courseId: string,
): Promise<string | undefined> {
  const { owner } = action;

  switch (action.kind) {
    case "announce": {
      const announcements = await gateway.listAnnouncements(owner, courseId);
      if (announcements.some(({ text }) => sameText(text) === sameText(action.text))) return;

      await gateway.createAnnouncement(owner, courseId, {
        key: "life",
        text: action.text,
        state: "PUBLISHED",
      });

      return `announce in ${action.course}: ${action.text}`;
    }
    case "edit-announcement": {
      const announcements = await gateway.listAnnouncements(owner, courseId);
      if (announcements.some(({ text }) => sameText(text) === sameText(action.to))) return;

      const target = announcements.find(({ text }) => sameText(text) === sameText(action.from));
      if (!target) throw new Error(`no announcement "${action.from}" to edit in ${action.course}`);

      await gateway.editAnnouncement(owner, courseId, target.id, action.to);

      return `edit announcement in ${action.course}: ${action.to}`;
    }
    case "move-coursework": {
      const work = (await gateway.listCoursework(owner, courseId)).find(
        ({ title }) => title === action.title,
      );
      if (!work) throw new Error(`no coursework "${action.title}" to move in ${action.course}`);
      if (sameDue(work.due, action.due)) return;

      await gateway.moveCoursework(owner, courseId, work.id, action.due);

      return `move coursework ${action.title} in ${action.course}`;
    }
    case "remove-coursework": {
      const work = (await gateway.listCoursework(owner, courseId)).find(
        ({ title }) => title === action.title,
      );
      if (!work) return;

      await gateway.removeCoursework(owner, courseId, work.id);

      return `remove coursework ${action.title} in ${action.course}`;
    }
  }
}

export async function applyLifeStep(
  actions: LifeActionPlan[],
  gateway: ClassroomGateway,
): Promise<string[]> {
  const writes: string[] = [];

  for (const action of actions) {
    const course = await findCourse(gateway, action.owner, action.course);
    if (!course)
      throw new Error(`no course "${action.course}" for ${action.owner}, provision first`);

    const write = await applyAction(gateway, action, course.id);
    if (write !== undefined) writes.push(write);
  }

  return writes;
}

function describeDue(due: DuePlan | undefined): string {
  if (due === undefined) return "no due date";

  const { year, month, day } = due.date;
  const pad = (value: number) => String(value).padStart(2, "0");

  return `due ${year}-${pad(month)}-${pad(day)} ${pad(due.time.hours)}:${pad(due.time.minutes)} UTC`;
}

function describePost(post: PostState): string {
  return post.state === "DRAFT" ? `scheduled ${post.scheduledTime}` : "published now";
}

export function describePlan(plan: ClassPlan): string[] {
  return plan.courses.flatMap((course) => [
    `${course.name} (owner ${course.owner}, ${course.description})`,
    `  students: ${course.students.join(", ")}`,
    ...course.announcements.map(
      (announcement) =>
        `  announce ${announcement.key} [${describePost(announcement)}]: ${announcement.text}`,
    ),
    ...course.coursework.map(
      (work) =>
        `  assign ${work.key} [${describePost(work)}, ${describeDue(work.due)}]: ${work.title}`,
    ),
  ]);
}

function describeLifeAction(action: LifeActionPlan): string {
  switch (action.kind) {
    case "announce":
      return `${action.course}: announce "${action.text}"`;
    case "edit-announcement":
      return `${action.course}: edit "${action.from}" into "${action.to}"`;
    case "move-coursework":
      return `${action.course}: move "${action.title}" to ${describeDue(action.due)}`;
    case "remove-coursework":
      return `${action.course}: remove "${action.title}"`;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function text(record: Record<string, unknown>, key: string): string {
  const value = record[key];

  return typeof value === "string" ? value : "";
}

function itemsOf(body: Record<string, unknown>, key: string): Record<string, unknown>[] {
  const items = body[key];

  return Array.isArray(items) ? items.filter(isRecord) : [];
}

class GoogleError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function googleJson(url: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
  const response = await fetch(url, init);
  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok || !isRecord(body)) {
    const detail = isRecord(body) ? JSON.stringify(body.error ?? body) : "no JSON body";
    throw new GoogleError(
      `${init.method ?? "GET"} ${url} answered ${response.status}: ${detail}`,
      response.status,
    );
  }

  return body;
}

interface ServiceAccount {
  clientEmail: string;
  privateKey: string;
}

function readServiceAccount(path: string): ServiceAccount {
  const key: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!isRecord(key) || !text(key, "client_email") || !text(key, "private_key")) {
    throw new Error(`${path} is no service account key (client_email, private_key)`);
  }

  return { clientEmail: text(key, "client_email"), privateKey: text(key, "private_key") };
}

const base64Url = (value: string | Buffer): string => Buffer.from(value).toString("base64url");

function delegatedTokens(account: ServiceAccount): (subject: string) => Promise<string> {
  const cache = new Map<string, Promise<string>>();

  const request = async (subject: string): Promise<string> => {
    const issuedAt = Math.floor(Date.now() / 1000);
    const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const claims = base64Url(
      JSON.stringify({
        iss: account.clientEmail,
        sub: subject,
        scope: PROVISIONING_SCOPES.join(" "),
        aud: TOKEN_URL,
        iat: issuedAt,
        exp: issuedAt + TOKEN_LIFETIME_S,
      }),
    );
    const signature = createSign("RSA-SHA256")
      .update(`${header}.${claims}`)
      .sign(account.privateKey);
    const body = await googleJson(TOKEN_URL, {
      method: "POST",
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: `${header}.${claims}.${base64Url(signature)}`,
      }),
    });
    const token = text(body, "access_token");
    if (!token) throw new Error(`no access token for ${subject}`);

    return token;
  };

  return (subject) => {
    const cached = cache.get(subject) ?? request(subject);
    cache.set(subject, cached);

    return cached;
  };
}

function remoteDue(work: Record<string, unknown>): DuePlan | undefined {
  const date = work.dueDate;
  if (!isRecord(date)) return undefined;

  const time = isRecord(work.dueTime) ? work.dueTime : {};
  const number = (record: Record<string, unknown>, key: string) =>
    typeof record[key] === "number" ? record[key] : 0;

  return {
    date: { year: number(date, "year"), month: number(date, "month"), day: number(date, "day") },
    time: { hours: number(time, "hours"), minutes: number(time, "minutes") },
  };
}

function postBody(post: PostState): Record<string, string> {
  return post.state === "DRAFT"
    ? { state: post.state, scheduledTime: post.scheduledTime }
    : { state: post.state };
}

function googleClassroom(tokenFor: (subject: string) => Promise<string>): ClassroomGateway {
  const call = async (
    as: string,
    path: string,
    init: { method?: string; body?: unknown } = {},
  ): Promise<Record<string, unknown>> => {
    const token = await tokenFor(as);

    return googleJson(`${CLASSROOM_API}${path}`, {
      method: init.method ?? "GET",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  };

  const listAll = async (as: string, path: string, key: string, query: URLSearchParams) => {
    const items: Record<string, unknown>[] = [];
    let pageToken = "";
    do {
      if (pageToken) query.set("pageToken", pageToken);
      const body = await call(as, `${path}?${query}`);
      items.push(...itemsOf(body, key));
      pageToken = text(body, "nextPageToken");
    } while (pageToken);

    return items;
  };

  const asCourse = (course: Record<string, unknown>): RemoteCourse => ({
    id: text(course, "id"),
    name: text(course, "name"),
    description: text(course, "description"),
    courseState: text(course, "courseState"),
  });

  return {
    async listCourses(as) {
      const query = new URLSearchParams({ teacherId: "me", pageSize: "100" });

      return (await listAll(as, "/courses", "courses", query)).map(asCourse);
    },
    async createCourse(as, course) {
      return asCourse(
        await call(as, "/courses", {
          method: "POST",
          body: { ...course, ownerId: "me", courseState: "ACTIVE" },
        }),
      );
    },
    async activateCourse(as, courseId) {
      await call(as, `/courses/${courseId}?updateMask=courseState`, {
        method: "PATCH",
        body: { courseState: "ACTIVE" },
      });
    },
    async isStudent(as, courseId, student) {
      try {
        await call(as, `/courses/${courseId}/students/${encodeURIComponent(student)}`);

        return true;
      } catch (error) {
        if (error instanceof GoogleError && error.status === 404) return false;
        throw error;
      }
    },
    async pendingInvitation(as, courseId, student) {
      const query = new URLSearchParams({ courseId, userId: student });
      const invitations = await listAll(as, "/invitations", "invitations", query);

      return invitations.map((invitation) => text(invitation, "id")).find(Boolean);
    },
    async invite(as, courseId, student) {
      const invitation = await call(as, "/invitations", {
        method: "POST",
        body: { courseId, userId: student, role: "STUDENT" },
      });

      return text(invitation, "id");
    },
    async acceptInvitation(as, invitationId) {
      await call(as, `/invitations/${invitationId}:accept`, { method: "POST" });
    },
    async listAnnouncements(as, courseId) {
      const query = new URLSearchParams({ pageSize: "100" });
      query.append("announcementStates", "PUBLISHED");
      query.append("announcementStates", "DRAFT");
      const announcements = await listAll(
        as,
        `/courses/${courseId}/announcements`,
        "announcements",
        query,
      );

      return announcements.map((item) => ({ id: text(item, "id"), text: text(item, "text") }));
    },
    async createAnnouncement(as, courseId, announcement) {
      await call(as, `/courses/${courseId}/announcements`, {
        method: "POST",
        body: { text: announcement.text, ...postBody(announcement) },
      });
    },
    async editAnnouncement(as, courseId, id, newText) {
      await call(as, `/courses/${courseId}/announcements/${id}?updateMask=text`, {
        method: "PATCH",
        body: { text: newText },
      });
    },
    async listCoursework(as, courseId) {
      const query = new URLSearchParams({ pageSize: "100" });
      query.append("courseWorkStates", "PUBLISHED");
      query.append("courseWorkStates", "DRAFT");
      const coursework = await listAll(as, `/courses/${courseId}/courseWork`, "courseWork", query);

      return coursework.map((item) => ({
        id: text(item, "id"),
        title: text(item, "title"),
        due: remoteDue(item),
      }));
    },
    async createCoursework(as, courseId, work) {
      await call(as, `/courses/${courseId}/courseWork`, {
        method: "POST",
        body: {
          title: work.title,
          description: work.description,
          workType: "ASSIGNMENT",
          ...(work.due && { dueDate: work.due.date, dueTime: work.due.time }),
          ...postBody(work),
        },
      });
    },
    async moveCoursework(as, courseId, id, due) {
      await call(as, `/courses/${courseId}/courseWork/${id}?updateMask=dueDate,dueTime`, {
        method: "PATCH",
        body: { dueDate: due.date, dueTime: due.time },
      });
    },
    async removeCoursework(as, courseId, id) {
      await call(as, `/courses/${courseId}/courseWork/${id}`, { method: "DELETE" });
    },
  };
}

function stepArgument(argv: string[]): number | undefined {
  const index = argv.indexOf("--step");
  if (index === -1) return undefined;

  const step = Number(argv[index + 1]);
  if (!Number.isInteger(step)) throw new Error("--step takes the number of a life step");

  return step;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const result = readConfig(process.env, { dryRun, repoRoot: resolve(import.meta.dir, "..") });
  if (!result.ok) {
    console.error(`refused: ${result.error} (see docs/DEPLOY.md, Test Classroom)`);
    process.exit(1);
  }

  const { config } = result;
  const step = stepArgument(argv);
  const life = step === undefined ? undefined : planLifeStep(CLASS_TEMPLATE, step, config);
  const plan = planClass(CLASS_TEMPLATE, { ...config, now: new Date() });

  if (dryRun) {
    for (const line of life ? life.map(describeLifeAction) : describePlan(plan)) console.log(line);
    return;
  }

  if (config.keyFile === undefined) throw new Error("no service account key");
  const gateway = googleClassroom(delegatedTokens(readServiceAccount(config.keyFile)));
  const writes = life ? await applyLifeStep(life, gateway) : await provision(plan, gateway);
  for (const write of writes) console.log(write);
  console.log(`${writes.length} write(s)`);
}

if (import.meta.main) {
  await main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}

import { readFileSync } from "node:fs";
import { join } from "node:path";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CLASSROOM_API = "https://classroom.googleapis.com/v1";
const DEFAULT_DATASET = join(import.meta.dir, "../modules/extraction/eval/synthetic.jsonl");
const DEFAULT_COURSE_PREFIX = "[TEST]";

const REQUIRED_VARIABLES = [
  "TEST_CLASSROOM_CLIENT_ID",
  "TEST_CLASSROOM_CLIENT_SECRET",
  "TEST_CLASSROOM_REFRESH_TOKEN",
] as const;

type RequiredVariable = (typeof REQUIRED_VARIABLES)[number];

interface PublisherConfig {
  credentials: Record<RequiredVariable, string>;
  courseId: string | undefined;
  coursePrefix: string;
  datasetPath: string;
}

interface SyntheticAnnouncement {
  id: string;
  text: string;
}

type ConfigResult = { ok: true; config: PublisherConfig } | { ok: false; missing: string[] };

export function readConfig(env: Record<string, string | undefined>): ConfigResult {
  const missing = REQUIRED_VARIABLES.filter((name) => !env[name]);
  if (missing.length > 0) return { ok: false, missing };

  return {
    ok: true,
    config: {
      credentials: {
        TEST_CLASSROOM_CLIENT_ID: env.TEST_CLASSROOM_CLIENT_ID ?? "",
        TEST_CLASSROOM_CLIENT_SECRET: env.TEST_CLASSROOM_CLIENT_SECRET ?? "",
        TEST_CLASSROOM_REFRESH_TOKEN: env.TEST_CLASSROOM_REFRESH_TOKEN ?? "",
      },
      courseId: env.TEST_CLASSROOM_COURSE_ID || undefined,
      coursePrefix: env.TEST_CLASSROOM_COURSE_PREFIX || DEFAULT_COURSE_PREFIX,
      datasetPath: env.TEST_CLASSROOM_DATASET || DEFAULT_DATASET,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseDataset(jsonl: string): SyntheticAnnouncement[] {
  return jsonl
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const row: unknown = JSON.parse(line);
      if (!isRecord(row) || typeof row.id !== "string" || typeof row.text !== "string") {
        throw new Error(`dataset line ${index + 1} has no string id and text`);
      }

      return { id: row.id, text: row.text };
    });
}

export function isTestCourse(name: unknown, prefix: string): boolean {
  return typeof name === "string" && prefix.trim().length > 0 && name.trim().startsWith(prefix);
}

const sameText = (text: string): string => text.trim().replace(/\s+/g, " ");

export function announcementsToPublish(
  dataset: SyntheticAnnouncement[],
  publishedTexts: string[],
): SyntheticAnnouncement[] {
  const published = new Set(publishedTexts.map(sameText));

  return dataset.filter((announcement) => !published.has(sameText(announcement.text)));
}

async function googleJson(url: string, init: RequestInit): Promise<Record<string, unknown>> {
  const response = await fetch(url, init);
  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok || !isRecord(body)) {
    const detail = isRecord(body) ? JSON.stringify(body.error ?? body) : "no JSON body";
    throw new Error(`${init.method ?? "GET"} ${url} answered ${response.status}: ${detail}`);
  }

  return body;
}

async function accessToken(credentials: PublisherConfig["credentials"]): Promise<string> {
  const body = await googleJson(TOKEN_URL, {
    method: "POST",
    body: new URLSearchParams({
      client_id: credentials.TEST_CLASSROOM_CLIENT_ID,
      client_secret: credentials.TEST_CLASSROOM_CLIENT_SECRET,
      refresh_token: credentials.TEST_CLASSROOM_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  if (typeof body.access_token !== "string") throw new Error("token endpoint gave no access_token");

  return body.access_token;
}

function listOf(body: Record<string, unknown>, key: string): Record<string, unknown>[] {
  const items = body[key];

  return Array.isArray(items) ? items.filter(isRecord) : [];
}

async function listCourses(token: string): Promise<void> {
  const body = await googleJson(`${CLASSROOM_API}/courses?teacherId=me&courseStates=ACTIVE`, {
    headers: { authorization: `Bearer ${token}` },
  });
  for (const course of listOf(body, "courses")) {
    console.log(`${String(course.id)}  ${String(course.name)}`);
  }
}

async function publishedTexts(token: string, courseId: string): Promise<string[]> {
  const texts: string[] = [];
  let pageToken = "";
  do {
    const query = new URLSearchParams({ pageSize: "100", announcementStates: "PUBLISHED" });
    if (pageToken) query.set("pageToken", pageToken);
    const body = await googleJson(`${CLASSROOM_API}/courses/${courseId}/announcements?${query}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    for (const announcement of listOf(body, "announcements")) {
      if (typeof announcement.text === "string") texts.push(announcement.text);
    }
    pageToken = typeof body.nextPageToken === "string" ? body.nextPageToken : "";
  } while (pageToken);

  return texts;
}

async function main(): Promise<void> {
  const result = readConfig(process.env);
  if (!result.ok) {
    console.error(
      `refused: set ${result.missing.join(", ")} (test OAuth client and the test teacher account, see docs/DEPLOY.md)`,
    );
    process.exit(1);
  }

  const { config } = result;
  const dryRun = process.argv.includes("--dry-run");
  const token = await accessToken(config.credentials);

  if (process.argv.includes("--list-courses") || !config.courseId) {
    await listCourses(token);
    if (!config.courseId) console.error("set TEST_CLASSROOM_COURSE_ID to one of these ids");
    return;
  }

  const course = await googleJson(`${CLASSROOM_API}/courses/${config.courseId}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!isTestCourse(course.name, config.coursePrefix)) {
    console.error(
      `refused: course ${config.courseId} is named "${String(course.name)}", a test class name starts with "${config.coursePrefix}" (TEST_CLASSROOM_COURSE_PREFIX)`,
    );
    process.exit(1);
  }

  const dataset = parseDataset(readFileSync(config.datasetPath, "utf8"));
  const pending = announcementsToPublish(dataset, await publishedTexts(token, config.courseId));
  console.log(`${dataset.length - pending.length} already published, ${pending.length} to publish`);

  for (const announcement of pending) {
    if (dryRun) {
      console.log(`would publish ${announcement.id}`);
      continue;
    }

    await googleJson(`${CLASSROOM_API}/courses/${config.courseId}/announcements`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ text: announcement.text, state: "PUBLISHED" }),
    });
    console.log(`published ${announcement.id}`);
  }
}

if (import.meta.main) await main();

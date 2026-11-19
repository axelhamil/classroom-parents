export const CLASSROOM_SCOPES = [
  "https://www.googleapis.com/auth/classroom.courses.readonly",
  "https://www.googleapis.com/auth/classroom.announcements.readonly",
  "https://www.googleapis.com/auth/classroom.student-submissions.me.readonly",
] as const;

const CANONICAL_BY_ALIAS: Readonly<Record<string, string>> = {
  "https://www.googleapis.com/auth/classroom.coursework.me.readonly":
    "https://www.googleapis.com/auth/classroom.student-submissions.me.readonly",
};

export function canonicalScope(scope: string): string {
  return CANONICAL_BY_ALIAS[scope] ?? scope;
}

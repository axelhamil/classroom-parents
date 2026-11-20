const CANONICAL_BY_ALIAS: Readonly<Record<string, string>> = {
  "https://www.googleapis.com/auth/classroom.coursework.me.readonly":
    "https://www.googleapis.com/auth/classroom.student-submissions.me.readonly",
};

export function canonicalScope(scope: string): string {
  return CANONICAL_BY_ALIAS[scope] ?? scope;
}

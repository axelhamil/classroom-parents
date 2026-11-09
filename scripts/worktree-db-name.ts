const PREFIX = "classroom_parents_";
const POSTGRES_IDENTIFIER_MAX = 63;

export function databaseNameFor(branch: string): string {
  const slug = branch.toLowerCase().replace(/[^a-z0-9]/g, "_");

  return `${PREFIX}${slug}`.slice(0, POSTGRES_IDENTIFIER_MAX);
}

if (import.meta.main) {
  const branch = process.argv[2];
  if (!branch) {
    console.error("usage: bun scripts/worktree-db-name.ts <branch>");
    process.exit(1);
  }

  console.log(databaseNameFor(branch));
}

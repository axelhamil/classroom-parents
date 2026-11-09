import { createHash } from "node:crypto";

const PREFIX = "classroom_parents_";
const POSTGRES_IDENTIFIER_MAX = 63;
const HASH_LENGTH = 8;

export function databaseNameFor(branch: string): string {
  const slug = branch.toLowerCase().replace(/[^a-z0-9]/g, "_");
  const name = `${PREFIX}${slug}`;
  if (name.length <= POSTGRES_IDENTIFIER_MAX) return name;

  const hash = createHash("sha256").update(branch).digest("hex").slice(0, HASH_LENGTH);
  const kept = POSTGRES_IDENTIFIER_MAX - HASH_LENGTH - 1;

  return `${name.slice(0, kept)}_${hash}`;
}

if (import.meta.main) {
  const branch = process.argv[2];
  if (!branch) {
    console.error("usage: bun scripts/worktree-db-name.ts <branch>");
    process.exit(1);
  }

  console.log(databaseNameFor(branch));
}

import { createHash } from "node:crypto";

const PREFIX = "classroom_parents_";
const POSTGRES_IDENTIFIER_MAX = 63;
const HASH_LENGTH = 8;
const DETACHED_HEAD = "HEAD";

const shortHash = (value: string): string =>
  createHash("sha256").update(value).digest("hex").slice(0, HASH_LENGTH);

export function databaseNameFor(branch: string, worktreeRoot = ""): string {
  if (branch === DETACHED_HEAD) return `${PREFIX}detached_${shortHash(worktreeRoot)}`;

  const slug = branch.toLowerCase().replace(/[^a-z0-9]/g, "_");
  const name = `${PREFIX}${slug}`;
  if (name.length <= POSTGRES_IDENTIFIER_MAX) return name;

  const hash = shortHash(branch);
  const kept = POSTGRES_IDENTIFIER_MAX - HASH_LENGTH - 1;

  return `${name.slice(0, kept)}_${hash}`;
}

if (import.meta.main) {
  const [branch, worktreeRoot] = process.argv.slice(2);
  if (!branch) {
    console.error("usage: bun scripts/worktree-db-name.ts <branch> [worktree root]");
    process.exit(1);
  }

  console.log(databaseNameFor(branch, worktreeRoot));
}

#!/usr/bin/env bash
set -euo pipefail

# Creates the Postgres database of the current worktree and points its .env files at it.
# The name comes from the branch (scripts/worktree-db-name.ts), or from the worktree path
# on a detached HEAD, so two worktrees never share a database. Idempotent: an existing database and existing .env values are kept,
# only DATABASE_URL is rewritten.

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT=54329
CONTAINER=classroom-parents-postgres

branch="$(git -C "$ROOT" rev-parse --abbrev-ref HEAD)"
name="$(bun "$ROOT/scripts/worktree-db-name.ts" "$branch" "$ROOT")"
url="postgresql://postgres:postgres@localhost:$PORT/$name"

for _ in $(seq 1 30); do
  if docker exec "$CONTAINER" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1; then break; fi
  sleep 1
done

exists="$(docker exec "$CONTAINER" psql -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$name'")"
if [ "$exists" = "1" ]; then
  echo "keep database $name"
else
  docker exec "$CONTAINER" createdb -U postgres "$name"
  echo "create database $name"
fi

for dir in apps/api packages/drizzle; do
  env_file="$ROOT/$dir/.env"
  if [ ! -f "$env_file" ]; then
    cp "$ROOT/$dir/.env.example" "$env_file"
  fi

  awk -v line="DATABASE_URL=$url" '
    /^DATABASE_URL=/ { print line; found = 1; next }
    { print }
    END { if (!found) print line }
  ' "$env_file" >"$env_file.tmp"
  mv "$env_file.tmp" "$env_file"
  echo "write DATABASE_URL into $dir/.env"
done

echo "$url"

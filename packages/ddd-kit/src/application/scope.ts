import type { UUID } from "../primitives/uuid";

export type RepoScope = { readonly kind: "user"; readonly userId: UUID<string> };

export type RepoScopeKind = RepoScope["kind"];

export type ScopeOf<K extends RepoScopeKind> = Extract<RepoScope, { kind: K }>;

export const RepoScope = {
  user(userId: UUID<string>): ScopeOf<"user"> {
    return { kind: "user", userId };
  },
  isUser(s: RepoScope): s is ScopeOf<"user"> {
    return s.kind === "user";
  },
} as const;

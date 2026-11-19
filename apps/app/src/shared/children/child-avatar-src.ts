import type { ChildDto } from "../api/queries/children";

export type ChildAvatarSource = Pick<ChildDto, "avatarUrl" | "showsPhoto">;

export function childAvatarSrc({ avatarUrl, showsPhoto }: ChildAvatarSource): string | null {
  return showsPhoto ? avatarUrl : null;
}

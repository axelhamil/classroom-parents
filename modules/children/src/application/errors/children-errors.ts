import type { ChildrenError } from "../ports/child-repository.port";

export const invalidGrant: ChildrenError = {
  code: "CHILD_TOKEN_INVALID_GRANT",
  message: "L'accès Google de cet enfant a expiré ou a été retiré. Reconnectez son compte.",
};

import type { ChildrenError } from "../ports/child-repository.port";

export const invalidGrant: ChildrenError = {
  code: "CHILD_TOKEN_INVALID_GRANT",
  message: "L'accès Google de cet enfant a expiré ou a été retiré. Reconnectez son compte.",
};

export const childNotFound: ChildrenError = {
  code: "CHILD_NOT_FOUND",
  message: "Cet enfant n'existe pas ou n'est plus relié à votre compte.",
};

export const accountNotLinked: ChildrenError = {
  code: "CHILD_ACCOUNT_NOT_LINKED",
  message: "Ce compte Google n'est pas relié à votre compte. Ajoutez-le de nouveau.",
};

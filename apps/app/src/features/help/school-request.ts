import type { TFunction } from "i18next";

export const SCHOOL_ADMIN_GUIDE_PATH = "/ecoles";

export interface SchoolRequestFacts {
  brand: string;
  clientId: string;
  scopes: readonly string[];
  guideUrl: string;
  privacyUrl: string;
  subProcessorsUrl: string;
}

export function schoolRequestBody(t: TFunction<"help">, facts: SchoolRequestFacts): string {
  const { brand, clientId, scopes, guideUrl, privacyUrl, subProcessorsUrl } = facts;

  return [
    t("school.message.body.greeting"),
    "",
    t("school.message.body.request", { brand }),
    "",
    t("school.message.body.steps"),
    "",
    t("school.message.body.clientId", { clientId }),
    t("school.message.body.scopes"),
    ...scopes.map((scope) => t("school.message.body.scope", { scope })),
    "",
    t("school.message.body.readOnly"),
    "",
    t("school.message.body.guide", { url: guideUrl }),
    t("school.message.body.privacy", { url: privacyUrl }),
    t("school.message.body.subProcessors", { url: subProcessorsUrl }),
    "",
    t("school.message.body.thanks"),
  ].join("\n");
}

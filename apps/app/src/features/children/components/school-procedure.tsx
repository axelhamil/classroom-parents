import { Button } from "@packages/ui/components/ui/button";
import {
  DescriptionDetails,
  DescriptionItem,
  DescriptionList,
  DescriptionTerm,
} from "@packages/ui/components/ui/description-list";
import { Panel } from "@packages/ui/components/ui/panel";
import {
  TypographyH3,
  TypographyInline,
  TypographyList,
  TypographyOrderedList,
  TypographyP,
} from "@packages/ui/components/ui/typography";
import { toastSuccess } from "@packages/web-kit/api/errors/toast";
import { useQuery } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { Share2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { type LinkConfig, linkConfigQueryOptions } from "../api/children.queries";
import type { SchoolErrorKind } from "../school-error";

const STEP_KEYS = [
  "school.steps.console",
  "school.steps.path",
  "school.steps.pending",
  "school.steps.configure",
] as const;

export interface SchoolProcedureProps {
  kind: SchoolErrorKind;
}

function procedureText(t: TFunction<"children">, kind: SchoolErrorKind, config: LinkConfig) {
  return [
    t(`school.kinds.${kind}`),
    "",
    ...STEP_KEYS.map((key, index) => t("school.shareStep", { index: index + 1, step: t(key) })),
    "",
    t("school.shareClientId", { clientId: config.clientId }),
    t("school.shareScopes"),
    ...config.scopes.map((scope) => t("school.shareScope", { scope })),
  ].join("\n");
}

async function shareProcedure(title: string, text: string, t: TFunction<"children">) {
  if (typeof navigator.share === "function") {
    await navigator.share({ title, text }).catch(() => undefined);
    return;
  }

  await navigator.clipboard
    .writeText(text)
    .then(() => toastSuccess(t("school.copied")))
    .catch(() => toast.error(t("school.copyFailed")));
}

export function SchoolProcedure({ kind }: SchoolProcedureProps) {
  const { t } = useTranslation("children");
  const config = useQuery(linkConfigQueryOptions).data;

  return (
    <Panel tone="muted" size="md" className="flex flex-col gap-4">
      <TypographyP>{t(`school.kinds.${kind}`)}</TypographyP>

      <TypographyH3>{t("school.title")}</TypographyH3>
      <TypographyOrderedList>
        {STEP_KEYS.map((key) => (
          <li key={key}>{t(key)}</li>
        ))}
      </TypographyOrderedList>

      {config && (
        <>
          <DescriptionList>
            <DescriptionItem>
              <DescriptionTerm>{t("school.clientId")}</DescriptionTerm>
              <DescriptionDetails className="break-all">
                <TypographyInline font="mono">{config.clientId}</TypographyInline>
              </DescriptionDetails>
            </DescriptionItem>
            <DescriptionItem>
              <DescriptionTerm>{t("school.scopes")}</DescriptionTerm>
              <DescriptionDetails>
                <TypographyList>
                  {config.scopes.map((scope) => (
                    <li key={scope} className="break-all">
                      <TypographyInline font="mono" size="xs">
                        {scope}
                      </TypographyInline>
                    </li>
                  ))}
                </TypographyList>
              </DescriptionDetails>
            </DescriptionItem>
          </DescriptionList>

          <Button
            variant="outline"
            onClick={() =>
              void shareProcedure(t("school.shareTitle"), procedureText(t, kind, config), t)
            }
          >
            <Share2 aria-hidden />
            {t("school.share")}
          </Button>
        </>
      )}
    </Panel>
  );
}

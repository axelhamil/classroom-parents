import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@packages/ui/components/ui/accordion";
import { Badge } from "@packages/ui/components/ui/badge";
import { Button } from "@packages/ui/components/ui/button";
import {
  DescriptionDetails,
  DescriptionItem,
  DescriptionList,
  DescriptionTerm,
} from "@packages/ui/components/ui/description-list";
import { Panel } from "@packages/ui/components/ui/panel";
import {
  TypographyH2,
  TypographyInline,
  TypographyList,
  TypographyMuted,
  TypographyP,
} from "@packages/ui/components/ui/typography";
import { toastSuccess } from "@packages/web-kit/api/errors/toast";
import { useQuery } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { Share2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { type LinkConfig, linkConfigQueryOptions } from "./child-link.queries";
import type { SchoolBlockKind } from "./school-error";

const STEPS = ["console", "path", "pending", "configure"] as const;

export interface SchoolProcedureProps {
  kind: SchoolBlockKind;
}

function procedureText(t: TFunction<"children">, kind: SchoolBlockKind, config: LinkConfig) {
  return [
    t(`school.kinds.${kind}`),
    "",
    ...STEPS.map((step, index) =>
      t("school.shareStep", { index: index + 1, step: t(`school.steps.${step}`) }),
    ),
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

      <div className="flex flex-col gap-1">
        <TypographyH2 variant="section">{t("school.title")}</TypographyH2>
        <TypographyMuted>{t("school.intro")}</TypographyMuted>
      </div>

      <Accordion type="single" collapsible defaultValue={STEPS[0]}>
        {STEPS.map((step, index) => (
          <AccordionItem key={step} value={step}>
            <AccordionTrigger>
              <span className="flex items-start gap-3">
                <Badge variant="secondary">{index + 1}</Badge>
                {t(`school.stepTitles.${step}`)}
              </span>
            </AccordionTrigger>
            <AccordionContent>{t(`school.steps.${step}`)}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>

      {config && (
        <>
          <DescriptionList>
            <DescriptionItem>
              <DescriptionTerm>{t("school.clientId")}</DescriptionTerm>
              <DescriptionDetails className="wrap-anywhere">
                <TypographyInline font="mono">{config.clientId}</TypographyInline>
              </DescriptionDetails>
            </DescriptionItem>
            <DescriptionItem>
              <DescriptionTerm>{t("school.scopes")}</DescriptionTerm>
              <DescriptionDetails>
                <TypographyList>
                  {config.scopes.map((scope) => (
                    <li key={scope} className="wrap-anywhere">
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
            className="self-start"
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

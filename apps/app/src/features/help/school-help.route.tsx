import { Badge } from "@packages/ui/components/ui/badge";
import { Button } from "@packages/ui/components/ui/button";
import { Item, ItemContent, ItemMedia, ItemTitle } from "@packages/ui/components/ui/item";
import { LoadErrorAlert } from "@packages/ui/components/ui/load-error-alert";
import { SectionCard } from "@packages/ui/components/ui/section-card";
import { SectionGrid } from "@packages/ui/components/ui/section-grid";
import { TypographyMuted, TypographyP } from "@packages/ui/components/ui/typography";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { linkConfigQueryOptions } from "../../shared/children/child-link.queries";
import { env } from "../../shared/env";
import { Screen } from "../../shared/layout/screen";
import { SchoolRequestMessage } from "./components/school-request-message";
import { SCHOOL_ADMIN_GUIDE_PATH, schoolRequestBody } from "./school-request";

export const Route = createFileRoute("/_protected/_shell/aide/ecole")({
  component: SchoolHelpPage,
});

const STEPS = ["contact", "send", "back"] as const;

function appUrl(path: string): string {
  return new URL(path, window.location.origin).href;
}

function SchoolHelpPage() {
  const { t } = useTranslation("help");

  return (
    <Screen title={t("school.title")} description={t("school.description")} width="full">
      <SectionGrid>
        <SectionCard title={t("school.why.title")}>
          <TypographyP>{t("school.why.body")}</TypographyP>
        </SectionCard>

        <SectionCard title={t("school.steps.title")}>
          <ol className="flex flex-col gap-2">
            {STEPS.map((step, index) => (
              <li key={step}>
                <Item variant="muted">
                  <ItemMedia>
                    <Badge variant="secondary">{index + 1}</Badge>
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>{t(`school.steps.${step}.title`)}</ItemTitle>
                    <TypographyMuted>{t(`school.steps.${step}.body`)}</TypographyMuted>
                  </ItemContent>
                </Item>
              </li>
            ))}
          </ol>
          <Button asChild variant="outline" className="self-start">
            <Link to="/children">{t("school.steps.back.action")}</Link>
          </Button>
        </SectionCard>

        <SectionCard
          title={t("school.message.title")}
          description={t("school.message.description")}
        >
          <RequestMessage />
        </SectionCard>
      </SectionGrid>
    </Screen>
  );
}

function RequestMessage() {
  const { t } = useTranslation("help");
  const { t: tCommon } = useTranslation("common");
  const config = useQuery(linkConfigQueryOptions);
  const brand = tCommon("brand");

  if (config.isPending) return <TypographyMuted>{t("school.message.loading")}</TypographyMuted>;
  if (config.isError) {
    return (
      <LoadErrorAlert
        message={t("school.message.loadError")}
        retry={
          <Button type="button" size="sm" variant="outline" onClick={() => void config.refetch()}>
            {t("school.message.retry")}
          </Button>
        }
      />
    );
  }

  const body = schoolRequestBody(t, {
    brand,
    clientId: config.data.clientId,
    scopes: config.data.scopes,
    guideUrl: new URL(SCHOOL_ADMIN_GUIDE_PATH, env.VITE_SITE_URL).href,
    privacyUrl: appUrl("/legal/privacy-policy"),
    subProcessorsUrl: appUrl("/legal/sub-processors"),
  });

  return (
    <SchoolRequestMessage subject={t("school.message.subject", { brand })} initialBody={body} />
  );
}

import {
  FlowDiagram,
  FlowEdge,
  FlowEdges,
  FlowNode,
  LandingSection,
  LandingSectionTitle,
} from "@packages/ui/components/ui/landing";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BellRingIcon,
  CheckIcon,
  GraduationCapIcon,
  ListChecksIcon,
  SmartphoneIcon,
  XIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

const READS = ["courses", "announcements", "coursework"] as const;
const NEVER = ["write", "grades", "messages", "ads"] as const;

export function ReadOnlyPromise() {
  const { t } = useTranslation("auth");

  return (
    <LandingSection surface="sheet">
      <FlowDiagram role="img" aria-label={t("landing.flow.label")}>
        <FlowNode>
          <GraduationCapIcon aria-hidden />
          {t("landing.flow.classroom")}
        </FlowNode>
        <FlowEdges>
          <FlowEdge>
            {t("landing.flow.reads")}
            <ArrowRightIcon aria-hidden />
          </FlowEdge>
          <FlowEdge tone="blocked">
            <ArrowLeftIcon aria-hidden />
            {t("landing.flow.never")}
          </FlowEdge>
        </FlowEdges>
        <FlowNode>
          <ListChecksIcon aria-hidden />
          {t("landing.flow.app")}
        </FlowNode>
        <FlowEdges>
          <FlowEdge>
            {t("landing.flow.alerts")}
            <ArrowRightIcon aria-hidden />
          </FlowEdge>
        </FlowEdges>
        <FlowNode>
          <SmartphoneIcon aria-hidden />
          {t("landing.flow.phone")}
          <BellRingIcon aria-hidden />
        </FlowNode>
      </FlowDiagram>

      <div className="grid gap-6 @xl:grid-cols-2">
        <section aria-labelledby="reads-title" className="flex flex-col gap-3">
          <LandingSectionTitle id="reads-title">{t("landing.reads.title")}</LandingSectionTitle>
          <ul className="flex flex-col gap-2">
            {READS.map((item) => (
              <li key={item} className="flex gap-2">
                <CheckIcon aria-hidden className="mt-1 size-4 shrink-0" />
                {t(`landing.reads.${item}`)}
              </li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="never-title" className="flex flex-col gap-3">
          <LandingSectionTitle id="never-title">{t("landing.never.title")}</LandingSectionTitle>
          <ul className="flex flex-col gap-2">
            {NEVER.map((item) => (
              <li key={item} className="flex gap-2">
                <XIcon aria-hidden className="mt-1 size-4 shrink-0" />
                {t(`landing.never.${item}`)}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </LandingSection>
  );
}

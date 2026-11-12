import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@packages/ui/components/ui/accordion";
import { LandingSection, LandingSectionTitle } from "@packages/ui/components/ui/landing";
import { TextLink } from "@packages/ui/components/ui/text-link";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

const QUESTIONS = ["blocked", "data", "deletion", "minors"] as const;

export function LandingFaq() {
  const { t } = useTranslation("auth");

  return (
    <LandingSection aria-labelledby="faq-title">
      <LandingSectionTitle id="faq-title">{t("landing.faq.title")}</LandingSectionTitle>
      <Accordion type="single" collapsible>
        {QUESTIONS.map((question) => (
          <AccordionItem key={question} value={question}>
            <AccordionTrigger>{t(`landing.faq.${question}.question`)}</AccordionTrigger>
            <AccordionContent forceMount className="flex flex-col gap-2">
              {t(`landing.faq.${question}.answer`)}
              {question === "data" && (
                <TextLink asChild>
                  <Link to="/legal/privacy-policy">{t("landing.faq.data.link")}</Link>
                </TextLink>
              )}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </LandingSection>
  );
}

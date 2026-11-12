import type { frCatalog } from "@packages/i18n";
import {
  LandingAction,
  LandingList,
  LandingSection,
  LandingSectionTitle,
  LandingSheet,
} from "@packages/ui/components/ui/landing";
import {
  StepListContent,
  StepListDescription,
  StepListTitle,
} from "@packages/ui/components/ui/step-list";
import { TextLink } from "@packages/ui/components/ui/text-link";
import { BellRingIcon, PencilOffIcon, UsersIcon } from "lucide-react";
import { GoogleCta } from "./google-cta";

const PROOFS = [
  { key: "family", icon: UsersIcon },
  { key: "alerts", icon: BellRingIcon },
  { key: "readOnly", icon: PencilOffIcon },
] as const;

export const FAQ_QUESTIONS = ["blocked", "data", "deletion"] as const;

export interface LandingDetailsProps {
  copy: (typeof frCatalog)["site"];
  signInUrl: string;
  privacyUrl: string;
}

export function LandingDetails({ copy, signInUrl, privacyUrl }: LandingDetailsProps) {
  return (
    <LandingSheet>
      <LandingSection aria-labelledby="proofs-title">
        <LandingSectionTitle id="proofs-title">{copy.proofs.title}</LandingSectionTitle>
        <LandingList>
          {PROOFS.map(({ key, icon: Icon }) => (
            <li key={key}>
              <Icon aria-hidden />
              {copy.proofs[key]}
            </li>
          ))}
        </LandingList>
      </LandingSection>

      <LandingSection aria-labelledby="faq-title">
        <LandingSectionTitle id="faq-title">{copy.faq.title}</LandingSectionTitle>
        {FAQ_QUESTIONS.map((question) => (
          <StepListContent key={question}>
            <StepListTitle>{copy.faq[question].question}</StepListTitle>
            <StepListDescription>{copy.faq[question].answer}</StepListDescription>
            {question === "data" && <TextLink href={privacyUrl}>{copy.faq.data.link}</TextLink>}
          </StepListContent>
        ))}
      </LandingSection>

      <LandingSection span="closing" aria-labelledby="closing-title">
        <LandingSectionTitle id="closing-title">{copy.closing.title}</LandingSectionTitle>
        <LandingAction>
          <GoogleCta href={signInUrl} label={copy.cta} />
        </LandingAction>
      </LandingSection>
    </LandingSheet>
  );
}

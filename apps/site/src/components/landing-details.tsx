import type { frCatalog } from "@packages/i18n";
import { IconTile } from "@packages/ui/components/ui/icon-tile";
import {
  LandingAction,
  LandingFaq,
  LandingFaqAnswer,
  LandingFaqItem,
  LandingFaqQuestion,
  LandingList,
  LandingSection,
  LandingSectionTitle,
  LandingSheet,
} from "@packages/ui/components/ui/landing";
import { TextLink } from "@packages/ui/components/ui/text-link";
import { BellRingIcon, PencilOffIcon, UsersIcon } from "lucide-react";
import { GoogleCta } from "./google-cta";
import { SCHOOL_GUIDE_PATH } from "./school-admin-guide";

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
              <IconTile>
                <Icon aria-hidden />
              </IconTile>
              {copy.proofs[key]}
            </li>
          ))}
        </LandingList>
      </LandingSection>

      <LandingSection aria-labelledby="faq-title">
        <LandingSectionTitle id="faq-title">{copy.faq.title}</LandingSectionTitle>
        <LandingFaq>
          {FAQ_QUESTIONS.map((question) => (
            <LandingFaqItem key={question}>
              <LandingFaqQuestion>{copy.faq[question].question}</LandingFaqQuestion>
              <LandingFaqAnswer>{copy.faq[question].answer}</LandingFaqAnswer>
              {question === "blocked" && (
                <LandingFaqAnswer>
                  <TextLink href={SCHOOL_GUIDE_PATH}>{copy.faq.blocked.link}</TextLink>
                </LandingFaqAnswer>
              )}
              {question === "data" && (
                <LandingFaqAnswer>
                  <TextLink href={privacyUrl}>{copy.faq.data.link}</TextLink>
                </LandingFaqAnswer>
              )}
            </LandingFaqItem>
          ))}
        </LandingFaq>
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

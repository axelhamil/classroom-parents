import type { frCatalog } from "@packages/i18n";
import { ReadOnlyIcon } from "@packages/ui/components/ui/icons";
import {
  LandingAction,
  LandingHeadline,
  LandingHeroCopy,
  LandingLead,
  LandingReassurance,
} from "@packages/ui/components/ui/landing";
import { GoogleCta } from "./google-cta";

export interface HeroCopyProps {
  copy: (typeof frCatalog)["site"];
  signInUrl: string;
}

export function HeroCopy({ copy, signInUrl }: HeroCopyProps) {
  return (
    <LandingHeroCopy>
      <LandingHeadline>{copy.headline}</LandingHeadline>
      <LandingLead>{copy.lead}</LandingLead>
      <LandingAction>
        <GoogleCta href={signInUrl} label={copy.cta} />
        <LandingReassurance>
          <ReadOnlyIcon aria-hidden />
          {copy.readOnly}
        </LandingReassurance>
      </LandingAction>
    </LandingHeroCopy>
  );
}

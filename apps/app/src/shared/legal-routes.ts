import {
  AccessibilityIcon,
  CookiesIcon,
  DocumentIcon,
  type Icon,
  PrivacyIcon,
  SubProcessorsIcon,
  TermsIcon,
} from "@packages/ui/components/ui/icons";

export interface LegalRoute {
  to: string;
  labelKey:
    | "legal.routes.dataRights"
    | "legal.routes.privacyPolicy"
    | "legal.routes.terms"
    | "legal.routes.subProcessors"
    | "legal.routes.accessibility"
    | "legal.routes.cookies";
  icon: Icon;
}

export const LEGAL_ROUTES: readonly LegalRoute[] = [
  { to: "/legal/data-rights", labelKey: "legal.routes.dataRights", icon: PrivacyIcon },
  { to: "/legal/privacy-policy", labelKey: "legal.routes.privacyPolicy", icon: DocumentIcon },
  { to: "/legal/terms", labelKey: "legal.routes.terms", icon: TermsIcon },
  { to: "/legal/sub-processors", labelKey: "legal.routes.subProcessors", icon: SubProcessorsIcon },
  {
    to: "/legal/accessibility",
    labelKey: "legal.routes.accessibility",
    icon: AccessibilityIcon,
  },
  { to: "/legal/cookies", labelKey: "legal.routes.cookies", icon: CookiesIcon },
];

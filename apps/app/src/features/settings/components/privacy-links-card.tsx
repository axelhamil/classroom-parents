import {
  Item,
  ItemActions,
  ItemContent,
  ItemMedia,
  ItemTitle,
} from "@packages/ui/components/ui/item";
import { SectionCard } from "@packages/ui/components/ui/section-card";
import { Link } from "@tanstack/react-router";
import { ChevronRight, FileText, type LucideIcon, Scale, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";

interface PrivacyLink {
  to: "/settings/privacy" | "/legal/privacy-policy" | "/legal/data-rights";
  key: "links.privacy" | "links.policy" | "links.dataRights";
  icon: LucideIcon;
}

const LINKS: readonly PrivacyLink[] = [
  { to: "/settings/privacy", key: "links.privacy", icon: ShieldCheck },
  { to: "/legal/privacy-policy", key: "links.policy", icon: FileText },
  { to: "/legal/data-rights", key: "links.dataRights", icon: Scale },
];

export function PrivacyLinksCard() {
  const { t } = useTranslation("settings");

  return (
    <SectionCard title={t("links.title")} description={t("links.description")}>
      <ul className="flex flex-col gap-2">
        {LINKS.map(({ to, key, icon: Icon }) => (
          <li key={to}>
            <Item variant="outline" size="sm" asChild>
              <Link to={to}>
                <ItemMedia>
                  <Icon aria-hidden />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>{t(key)}</ItemTitle>
                </ItemContent>
                <ItemActions>
                  <ChevronRight aria-hidden />
                </ItemActions>
              </Link>
            </Item>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

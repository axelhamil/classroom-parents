import {
  DocumentIcon,
  type Icon,
  OpenRowIcon,
  PrivacyIcon,
  RightsIcon,
} from "@packages/ui/components/ui/icons";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemMedia,
  ItemTitle,
} from "@packages/ui/components/ui/item";
import { SectionCard } from "@packages/ui/components/ui/section-card";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

interface PrivacyLink {
  to: "/settings/privacy" | "/legal/privacy-policy" | "/legal/data-rights";
  key: "links.privacy" | "links.policy" | "links.dataRights";
  icon: Icon;
}

const LINKS: readonly PrivacyLink[] = [
  { to: "/settings/privacy", key: "links.privacy", icon: PrivacyIcon },
  { to: "/legal/privacy-policy", key: "links.policy", icon: DocumentIcon },
  { to: "/legal/data-rights", key: "links.dataRights", icon: RightsIcon },
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
                  <OpenRowIcon
                    aria-hidden
                    className="transition-transform group-hover/item:translate-x-0.5"
                  />
                </ItemActions>
              </Link>
            </Item>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

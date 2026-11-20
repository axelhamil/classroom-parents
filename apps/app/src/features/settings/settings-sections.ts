import {
  AccountIcon,
  AiIcon,
  ColorIcon,
  HelpIcon,
  type Icon,
  NotificationsIcon,
  PrivacyIcon,
  RegionIcon,
} from "@packages/ui/components/ui/icons";

export const SETTINGS_SECTIONS = [
  "notifications",
  "region",
  "ai",
  "appearance",
  "account",
  "privacy",
  "help",
] as const;

export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number];

export const SECTION_ICONS = {
  notifications: NotificationsIcon,
  region: RegionIcon,
  ai: AiIcon,
  appearance: ColorIcon,
  account: AccountIcon,
  privacy: PrivacyIcon,
  help: HelpIcon,
} as const satisfies Record<SettingsSectionId, Icon>;

export const SECTION_PATHS = {
  notifications: "/settings/notifications",
  region: "/settings/region",
  ai: "/settings/ai",
  appearance: "/settings/appearance",
  account: "/settings/account",
  privacy: "/settings/privacy",
  help: "/settings/help",
} as const satisfies Record<SettingsSectionId, `/settings/${SettingsSectionId}`>;

export function sectionOfPath(pathname: string): SettingsSectionId | undefined {
  return SETTINGS_SECTIONS.find((id) => pathname.startsWith(SECTION_PATHS[id]));
}

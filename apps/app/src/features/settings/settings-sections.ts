export const SETTINGS_SECTIONS = [
  "notifications",
  "region",
  "account",
  "appearance",
  "privacy",
] as const;

export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number];

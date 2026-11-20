import type { SettingsSectionId } from "./settings-sections";

export const SETTINGS_ANCHORS = {
  push: "push",
  reminders: "reminders",
  quietHours: "quiet-hours",
  digest: "digest",
  languageAndRegion: "language-and-region",
  schoolCalendar: "school-calendar",
  aiReading: "ai-reading",
  theme: "theme",
  palette: "palette",
  account: "account",
  devices: "devices",
  data: "data",
  export: "export",
  deletion: "deletion",
  tour: "help",
  schoolHelp: "help",
  contact: "help",
} as const;

export type SettingsAnchor = keyof typeof SETTINGS_ANCHORS;

export interface SettingsSearchEntry {
  anchor: SettingsAnchor;
  section: SettingsSectionId;
  label:
    | "push.title"
    | "reminders.title"
    | "quietHours.title"
    | "digest.title"
    | "languageAndRegion.title"
    | "schoolHolidays.title"
    | "aiReading.enabled"
    | "appearance.mode"
    | "appearance.palette"
    | "account.title"
    | "devices.title"
    | "privacy.reads.title"
    | "export.title"
    | "deletion.title"
    | "tour.title"
    | "schoolHelp.title"
    | "help.contact";
}

export const SETTINGS_SEARCH: readonly SettingsSearchEntry[] = [
  { anchor: "push", section: "notifications", label: "push.title" },
  { anchor: "reminders", section: "notifications", label: "reminders.title" },
  { anchor: "quietHours", section: "notifications", label: "quietHours.title" },
  { anchor: "digest", section: "notifications", label: "digest.title" },
  { anchor: "languageAndRegion", section: "region", label: "languageAndRegion.title" },
  { anchor: "schoolCalendar", section: "region", label: "schoolHolidays.title" },
  { anchor: "aiReading", section: "ai", label: "aiReading.enabled" },
  { anchor: "theme", section: "appearance", label: "appearance.mode" },
  { anchor: "palette", section: "appearance", label: "appearance.palette" },
  { anchor: "account", section: "account", label: "account.title" },
  { anchor: "devices", section: "account", label: "devices.title" },
  { anchor: "data", section: "privacy", label: "privacy.reads.title" },
  { anchor: "export", section: "privacy", label: "export.title" },
  { anchor: "deletion", section: "privacy", label: "deletion.title" },
  { anchor: "tour", section: "help", label: "tour.title" },
  { anchor: "schoolHelp", section: "help", label: "schoolHelp.title" },
  { anchor: "contact", section: "help", label: "help.contact" },
];

import type { ItemToBring, ParentAction } from "@packages/events/agenda-contract";

export interface ExportedAccount {
  name: string;
  email: string;
  createdAt: string;
}

export interface ExportedChild {
  id: string;
  label: string;
  googleEmail: string;
  color: number;
  avatarUrl: string | null;
  showsPhoto: boolean;
  status: string;
  connectedAt: string;
  lastSyncedAt: string | null;
}

export interface ExportedReminder {
  kind: string;
  days?: number;
  time?: string;
  hours?: number;
}

export interface ExportedCourse {
  id: string;
  name: string;
}

export interface CollectedEvent {
  id: string;
  childId: string;
  source: string;
  courseId: string | null;
  announcementUrl: string | null;
  title: string;
  description: string;
  category: string;
  deadlineDate: string;
  deadlineTime: string | null;
  deadlineAt: string;
  receivedAt: string;
  status: string;
  reviewReasons: string[];
  evidenceQuote: string | null;
  evidenceStart: number | null;
  evidenceEnd: number | null;
  evidenceBefore: string;
  evidenceAfter: string;
  parentActions: ParentAction[];
  toBring: ItemToBring[];
  amendReason: string | null;
  confirmedByParentAt: string | null;
  done: boolean;
  checklist: { done: string[]; removed: string[]; extra: { id: string; label: string }[] };
  editedAt: string | null;
  editedFields: string[];
  deletedAt: string | null;
  withdrawnAt: string | null;
  createdAt: string;
  reminders: ExportedReminder[] | null;
}

export interface ExportedEvent extends CollectedEvent {
  course: ExportedCourse | null;
}

export interface ExportedAlert {
  eventId: string;
  reminder: string;
  dueAt: string;
  status: string;
  sentAt: string | null;
}

export interface ExportedPushSubscription {
  endpointHost: string;
  createdAt: string;
}

export interface ExportedSyncState {
  childId: string;
  status: string;
  reconnectCause: string | null;
  lastSyncedAt: string | null;
  nextSyncAt: string;
  lastSyncRequestedAt: string | null;
  announcementsSeen: number;
}

export interface ExportedCalendarFeed {
  childIds: string[] | null;
  createdAt: string;
  rotatedAt: string | null;
  lastFetchedAt: string | null;
}

export interface ExportedDigestWeek {
  weekStart: string;
  status: string;
  channel: string | null;
  sentAt: string | null;
}

export interface ExportedWeeklyDigest {
  enabled: boolean;
  chosenAt: string | null;
  weeks: ExportedDigestWeek[];
}

export interface ExportedAccessLossWarning {
  childId: string;
  dueAt: string;
  status: string;
  channel: string | null;
  sentAt: string | null;
  closedAt: string | null;
}

export interface ExportedSchoolHolidayPeriod {
  name: string;
  startsOn: string;
  endsOn: string;
  origin: string;
  addedAt: string;
}

export interface ExportedSchoolCalendar {
  country: string;
  region: string | null;
  schoolHolidays: string;
  chosenAt: string;
}

export interface ExportedHomeLayout {
  blocks: unknown[];
  chosenAt: string;
}

export interface ExportedHomeNote {
  body: string;
  writtenAt: string;
}

export interface ExportedQuietHours {
  enabled: boolean;
  start: string;
  end: string;
  chosenAt: string;
}

export interface ExportedLockScreen {
  details: boolean;
  chosenAt: string | null;
}

export interface ExportedAssistantPreferences {
  locale: string | null;
  timeZone: string | null;
  country: string | null;
  extractionEnabled: boolean;
  chosenAt: string;
}

export interface ExportedAiUsage {
  month: string;
  feature: string;
  calls: number;
  escalations: number;
  costMicroUsd: number;
}

export interface ExportedAiCall {
  at: string;
  feature: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costMicroUsd: number;
  outcome: string;
}

export interface ExportedNotification {
  kind: string;
  childId: string | null;
  params: Record<string, unknown>;
  members: string[];
  createdAt: string;
  readAt: string | null;
}

export interface UserDataSnapshot {
  children: ExportedChild[];
  events: CollectedEvent[];
  defaultReminders: ExportedReminder[] | null;
  quietHours: ExportedQuietHours | null;
  alerts: ExportedAlert[];
  pushSubscriptions: ExportedPushSubscription[];
  lockScreen: ExportedLockScreen;
  calendarFeed: ExportedCalendarFeed | null;
  weeklyDigest: ExportedWeeklyDigest;
  accessLossWarnings: ExportedAccessLossWarning[];
  schoolCalendar: ExportedSchoolCalendar | null;
  schoolHolidayPeriods: ExportedSchoolHolidayPeriod[];
  assistantPreferences: ExportedAssistantPreferences | null;
  aiUsage: ExportedAiUsage[];
  aiCalls: ExportedAiCall[];
  homeLayout: ExportedHomeLayout | null;
  homeNote: ExportedHomeNote | null;
  notifications: ExportedNotification[];
  sync: ExportedSyncState[];
}

export interface UserDataExport extends Omit<UserDataSnapshot, "events"> {
  events: ExportedEvent[];
  format: "classroom-parents-export";
  version: 1;
  exportedAt: string;
  account: ExportedAccount;
}

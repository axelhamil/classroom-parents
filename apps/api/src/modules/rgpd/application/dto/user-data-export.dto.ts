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

export interface ExportedEvent {
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
  done: boolean;
  editedAt: string | null;
  editedFields: string[];
  deletedAt: string | null;
  withdrawnAt: string | null;
  createdAt: string;
  reminders: ExportedReminder[] | null;
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

export interface ExportedQuietHours {
  enabled: boolean;
  start: string;
  end: string;
  chosenAt: string;
}

export interface UserDataSnapshot {
  children: ExportedChild[];
  events: ExportedEvent[];
  defaultReminders: ExportedReminder[] | null;
  quietHours: ExportedQuietHours | null;
  alerts: ExportedAlert[];
  pushSubscriptions: ExportedPushSubscription[];
  calendarFeed: ExportedCalendarFeed | null;
  weeklyDigest: ExportedWeeklyDigest;
  sync: ExportedSyncState[];
}

export interface UserDataExport extends UserDataSnapshot {
  format: "classroom-parents-export";
  version: 1;
  exportedAt: string;
  account: ExportedAccount;
}

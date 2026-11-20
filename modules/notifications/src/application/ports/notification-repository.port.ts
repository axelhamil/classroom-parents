import type { AppError, Option, Result } from "@packages/ddd-kit";
import type { NotificationContent } from "../../domain/notification-content";

export type NotificationsError = AppError<
  "NOTIFICATION_NOT_FOUND" | "NOTIFICATIONS_PROVIDER_FAILURE"
>;

export const notificationNotFound: NotificationsError = {
  code: "NOTIFICATION_NOT_FOUND",
  message: "Cette notification n'existe plus. Rouvrez la liste des notifications.",
};

export interface NotificationDraft {
  userId: string;
  ref: string;
  childId: Option<string>;
  content: NotificationContent;
  at: Date;
}

export interface PostedNotification {
  notificationId: string;
  grouped: boolean;
}

export interface StoredNotification {
  id: string;
  childId: Option<string>;
  content: NotificationContent;
  createdAt: Date;
  readAt: Option<Date>;
}

export interface FeedCursor {
  at: string;
  id: string;
}

export interface FeedPage {
  notifications: StoredNotification[];
  nextCursor: Option<string>;
}

export interface INotificationRepository {
  post(draft: NotificationDraft): Promise<Result<Option<PostedNotification>, NotificationsError>>;
  page(
    userId: string,
    cursor: Option<FeedCursor>,
    limit: number,
  ): Promise<Result<FeedPage, NotificationsError>>;
  unreadCount(userId: string): Promise<Result<number, NotificationsError>>;
  markRead(
    userId: string,
    notificationId: string,
    at: Date,
  ): Promise<Result<ReadMark, NotificationsError>>;
  markReadByRef(
    userId: string,
    ref: string,
    at: Date,
  ): Promise<Result<Option<string>, NotificationsError>>;
  markAllRead(userId: string, at: Date): Promise<Result<number, NotificationsError>>;
}

export type ReadMark = "read" | "already_read" | "absent";

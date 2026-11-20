/**
 * The reference a push and its in-app notification share, so that opening the push marks the
 * notification read. Built here once because two modules write it: alerts puts it in the push
 * it sends, notifications keys the row it writes on it. Why one builder: a reference spelled
 * twice drifts, and the push would then never find its notification.
 */
export const notificationRef = {
  reminders: (batchKey: string): string => `reminders:${batchKey}`,
  weeklyDigest: (digestId: string): string => `digest:${digestId}`,
  accessLoss: (accessAlertId: string): string => `access-loss:${accessAlertId}`,
};

/** The query parameter a push link carries its reference in, read by the app it opens. */
export const NOTIFICATION_REF_PARAM = "notification";

/** The link a push opens, carrying the reference of its in-app notification. */
export function linkWithNotificationRef(url: string, ref: string): string {
  const link = new URL(url);
  link.searchParams.set(NOTIFICATION_REF_PARAM, ref);

  return link.toString();
}

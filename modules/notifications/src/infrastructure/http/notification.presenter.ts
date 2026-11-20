import type { Feed, FeedNotification } from "../../application/services/notification-feed.service";

function presentNotification({ id, content, childId, event, createdAt, readAt }: FeedNotification) {
  const eventChildId = event.map((summary) => summary.childId).toNull();

  return {
    id,
    content,
    childId: childId.toNull() ?? eventChildId,
    event: event.map((summary) => ({ id: summary.id, title: summary.title })).toNull(),
    createdAt: createdAt.toISOString(),
    readAt: readAt.map((at) => at.toISOString()).toNull(),
  };
}

export function presentFeed({ notifications, nextCursor }: Feed) {
  return {
    notifications: notifications.map(presentNotification),
    nextCursor: nextCursor.toNull(),
  };
}

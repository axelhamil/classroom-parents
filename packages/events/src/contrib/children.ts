import { z } from "zod";
import { defineEventContribution } from "../contribution";

const ChildRef = z.object({ userId: z.string(), childId: z.string() });

export const childrenEvents = defineEventContribution({
  types: {
    CHILD_CONNECTED: "child.account.connected",
    CHILD_RENAMED: "child.account.renamed",
    CHILD_COLOR_CHANGED: "child.account.color_changed",
    CHILD_PHOTO_CHOICE_CHANGED: "child.account.photo_choice_changed",
    CHILD_DISCONNECT_REQUESTED: "child.account.disconnect_requested",
    CHILD_DISCONNECTED: "child.account.disconnected",
    CHILD_NEEDS_RECONNECT: "child.account.reconnect_needed",
    CHILD_SYNC_REQUESTED: "child.account.sync_requested",
  },
  payloads: {
    "child.account.connected": ChildRef.extend({
      restoredFrom: z.enum(["invalid_grant", "school_blocked"]).optional(),
      actorUserId: z.string().nullable(),
    }),
    "child.account.renamed": ChildRef,
    "child.account.color_changed": ChildRef.extend({
      actorUserId: z.string(),
      color: z.number().int().min(1).max(16),
    }),
    "child.account.photo_choice_changed": ChildRef.extend({
      actorUserId: z.string(),
      showsPhoto: z.boolean(),
    }),
    "child.account.disconnect_requested": ChildRef,
    "child.account.disconnected": ChildRef,
    "child.account.reconnect_needed": ChildRef.extend({
      cause: z.enum(["invalid_grant", "school_blocked"]),
      actorUserId: z.null(),
    }),
    "child.account.sync_requested": ChildRef.extend({ actorUserId: z.string() }),
  },
  retention: {
    "child.account.connected": "compliance",
    "child.account.renamed": "operational",
    "child.account.color_changed": "operational",
    "child.account.photo_choice_changed": "operational",
    "child.account.disconnect_requested": "compliance",
    "child.account.disconnected": "compliance",
    "child.account.reconnect_needed": "operational",
    "child.account.sync_requested": "operational",
  },
  visibility: {
    "child.account.connected": "public",
    "child.account.renamed": "public",
    "child.account.color_changed": "public",
    "child.account.photo_choice_changed": "public",
    "child.account.disconnect_requested": "public",
    "child.account.disconnected": "public",
    "child.account.reconnect_needed": "public",
    "child.account.sync_requested": "public",
  },
  descriptions: {
    "child.account.connected":
      "A parent connected a child's Google Classroom account, or reconnected it after a break; restoredFrom names the break it ends (school_blocked: the school has just allowed the app); actorUserId is the parent who reconnected, null when the scheduled sync found the school had allowed the app.",
    "child.account.renamed": "A parent renamed a connected child.",
    "child.account.color_changed": "A parent picked another color for a child.",
    "child.account.photo_choice_changed":
      "A parent chose between a child's Google photo and its initial on its color.",
    "child.account.disconnect_requested":
      "A child's disconnection started: the child stops syncing until its Google access is revoked and its data erased.",
    "child.account.disconnected":
      "A parent disconnected a child: Google access revoked, linked account and child data erased.",
    "child.account.reconnect_needed":
      "A child's Classroom access stopped working (token revoked or app blocked by the school).",
    "child.account.sync_requested":
      "A parent asked to refresh a child's Classroom data now, outside the regular sync cadence.",
  },
});

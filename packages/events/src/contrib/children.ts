import { z } from "zod";
import { defineEventContribution } from "../contribution";

const ChildRef = z.object({ userId: z.string(), childId: z.string() });

export const childrenEvents = defineEventContribution({
  types: {
    CHILD_CONNECTED: "child.account.connected",
    CHILD_RENAMED: "child.account.renamed",
    CHILD_DISCONNECT_REQUESTED: "child.account.disconnect_requested",
    CHILD_DISCONNECTED: "child.account.disconnected",
    CHILD_NEEDS_RECONNECT: "child.account.reconnect_needed",
  },
  payloads: {
    "child.account.connected": ChildRef,
    "child.account.renamed": ChildRef,
    "child.account.disconnect_requested": ChildRef,
    "child.account.disconnected": ChildRef,
    "child.account.reconnect_needed": ChildRef.extend({
      cause: z.enum(["invalid_grant", "school_blocked"]),
      actorUserId: z.null(),
    }),
  },
  retention: {
    "child.account.connected": "compliance",
    "child.account.renamed": "operational",
    "child.account.disconnect_requested": "compliance",
    "child.account.disconnected": "compliance",
    "child.account.reconnect_needed": "operational",
  },
  visibility: {
    "child.account.connected": "public",
    "child.account.renamed": "public",
    "child.account.disconnect_requested": "public",
    "child.account.disconnected": "public",
    "child.account.reconnect_needed": "public",
  },
  descriptions: {
    "child.account.connected":
      "A parent connected a child's Google Classroom account, or reconnected it after a break.",
    "child.account.renamed": "A parent renamed a connected child.",
    "child.account.disconnect_requested":
      "A child's disconnection started: the child stops syncing until its Google access is revoked and its data erased.",
    "child.account.disconnected":
      "A parent disconnected a child: Google access revoked, linked account and child data erased.",
    "child.account.reconnect_needed":
      "A child's Classroom access stopped working (token revoked or app blocked by the school).",
  },
});

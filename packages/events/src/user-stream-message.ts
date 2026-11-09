import { z } from "zod";

export const UserStreamMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("events.changed") }),
  z.object({ type: z.literal("children.changed") }),
  z.object({ type: z.literal("sync.finished"), childId: z.string() }),
]);
export type UserStreamMessage = z.infer<typeof UserStreamMessage>;

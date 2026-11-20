import { timeIdCursorSchema } from "@packages/http/time-id-cursor";
import { z } from "zod";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

export const listNotificationsQuerySchema = z.object({
  cursor: timeIdCursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export const notificationIdParamSchema = z.object({ id: z.uuid() });

export const readByRefBodySchema = z.object({ ref: z.string().min(1).max(200) });

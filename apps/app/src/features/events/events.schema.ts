import { z } from "zod";

export const alertTimeSchema = z.object({
  date: z.iso.date(),
  time: z.iso.time({ precision: -1 }),
});

export type AlertTimeInput = z.infer<typeof alertTimeSchema>;

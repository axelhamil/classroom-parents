import { z } from "zod";
import { isKnownPushService } from "../config/push-services";

const base64Url = z
  .string()
  .regex(/^[A-Za-z0-9_-]+=*$/)
  .min(1)
  .max(256);

export const pushSubscriptionSchema = z.object({
  endpoint: z
    .url({ protocol: /^https$/ })
    .max(2048)
    .refine(isKnownPushService),
  keys: z.object({ p256dh: base64Url, auth: base64Url }),
  userAgent: z.string().optional(),
});

export type PushSubscriptionInput = z.input<typeof pushSubscriptionSchema>;

export const pushSubscriptionBodySchema = z.object({
  endpoint: z.string(),
  keys: z.object({ p256dh: z.string(), auth: z.string() }),
});

export const pushEndpointBodySchema = z.object({ endpoint: z.string().max(2048) });

export interface PushStatusDto {
  live: number;
}

export interface PushConfigDto {
  vapidPublicKey: string;
}

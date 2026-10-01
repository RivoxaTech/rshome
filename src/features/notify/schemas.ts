import { z } from "zod";

/** What the browser's `PushSubscription.toJSON()` sends to `/api/push/subscribe`. */
export const pushSubscribeSchema = z.object({
  endpoint: z.url().max(500),
  keys: z.object({
    p256dh: z.string().min(1).max(191),
    auth: z.string().min(1).max(191),
  }),
});
export type PushSubscribeInput = z.infer<typeof pushSubscribeSchema>;

export const pushUnsubscribeSchema = z.object({
  endpoint: z.url().max(500),
});

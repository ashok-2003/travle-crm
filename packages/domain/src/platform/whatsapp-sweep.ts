// The console's hourly sweep of WhatsApp's stored webhook events (ADR 0035, spec 4.2 W5): a stored event holds the customer's
// number, name and words in a table outside row-level security, so the payload of events processed more than 7 days ago is
// blanked, routed or not, keeping the id, type and times. The message is the durable copy. Only the platform role may change
// a payload, which is why this runs in the console and not the worker.
import { WHATSAPP_PROVIDER } from "../inbox/index.js";
import type { ScheduledJob } from "../jobs/index.js";
import { blankProcessedPayloads } from "../webhooks/index.js";
import type { PlatformServices } from "./services.js";

export const SWEEP_WHATSAPP_QUEUE = "platform.sweep-whatsapp";

const KEEP_DAYS = 7;

/** Blanks the old events now; returns how many. */
export async function sweepWhatsAppNow(services: PlatformServices, now: Date): Promise<{ blanked: number }> {
  const olderThan = new Date(now.getTime() - KEEP_DAYS * 86_400_000);
  const blanked = await services.platformDb.transaction((tx) =>
    blankProcessedPayloads(tx, WHATSAPP_PROVIDER, olderThan),
  );
  return { blanked };
}

/** Hourly, at 41 minutes past, away from the other sweeps. */
export function whatsappSweepSchedule(services: PlatformServices): ScheduledJob {
  return {
    queue: SWEEP_WHATSAPP_QUEUE,
    cron: "41 * * * *",
    timeZone: "Asia/Kolkata",
    handle: async () => {
      await sweepWhatsAppNow(services, new Date());
    },
  };
}

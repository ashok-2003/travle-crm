// WhatsApp's 24-hour window (spec 4.4 S3): free text and files may be sent for 24 hours after the customer's latest message.
export const WINDOW_MS = 24 * 3_600_000;

/** When the window closes, or null when the customer never wrote. */
export const windowEndOf = (lastInboundAt: Date | null): Date | null =>
  lastInboundAt === null ? null : new Date(lastInboundAt.getTime() + WINDOW_MS);

/** Whether free text may be sent at `now`. */
export function windowIsOpen(lastInboundAt: Date | null, now: Date): boolean {
  const end = windowEndOf(lastInboundAt);
  return end !== null && end.getTime() > now.getTime();
}

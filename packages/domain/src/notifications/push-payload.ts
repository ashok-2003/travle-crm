// Fits a notification into what a push service accepts, by shortening the text rather than failing to send it.
import { MAX_PUSH_PAYLOAD_BYTES, type PushPayload } from "@travel-crm/integrations/push";

const ELLIPSIS = "…";

const size = (payload: PushPayload): number => Buffer.byteLength(JSON.stringify(payload));

/** `text` cut to `length` characters (whole characters, never half an emoji), with an ellipsis. */
function shorten(text: string, length: number): string {
  const characters = Array.from(text);
  return characters.length <= length ? text : `${characters.slice(0, Math.max(length - 1, 0)).join("")}${ELLIPSIS}`;
}

/** The payload, with the body and then the title cut short only as far as needed to fit. The link is never cut. */
export function fitPushPayload(payload: PushPayload): PushPayload {
  const fitted = { ...payload };
  for (const field of ["body", "title"] as const) {
    let length = Array.from(fitted[field]).length;
    while (size(fitted) > MAX_PUSH_PAYLOAD_BYTES && length > 1) {
      length = Math.floor(length * 0.8);
      fitted[field] = shorten(payload[field], length);
    }
  }
  return fitted;
}

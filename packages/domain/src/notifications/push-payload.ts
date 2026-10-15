// Fits a notification into what a push service accepts, by shortening the text rather than failing to send it.
import { MAX_PUSH_PAYLOAD_BYTES, type PushPayload } from "@travel-crm/integrations/push";

const ELLIPSIS = "…";

/** A title bigger than this is cut before the body is, so a huge title can't squeeze the body out. */
const MAX_TITLE_BYTES = 1000;

const jsonBytes = (value: unknown): number => Buffer.byteLength(JSON.stringify(value));
const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/**
 * `text` cut to the longest run of whole characters as people see them (an emoji family or a flag is one) that
 * still fits, with an ellipsis. `fits` says whether a candidate text is small enough.
 */
function cutToFit(text: string, fits: (candidate: string) => boolean): string {
  if (fits(text)) return text;
  const graphemes = Array.from(segmenter.segment(text), ({ segment }) => segment);
  const candidate = (count: number) => `${graphemes.slice(0, count).join("")}${ELLIPSIS}`;
  let low = 0;
  let high = graphemes.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (fits(candidate(middle))) low = middle;
    else high = middle - 1;
  }
  return candidate(low);
}

/** The payload, with the text cut short only as far as needed to fit. The link is never cut. */
export function fitPushPayload(payload: PushPayload): PushPayload {
  const fitted = { ...payload };
  fitted.title = cutToFit(fitted.title, (title) => jsonBytes(title) <= MAX_TITLE_BYTES);
  fitted.body = cutToFit(fitted.body, (body) => jsonBytes({ ...fitted, body }) <= MAX_PUSH_PAYLOAD_BYTES);
  // Only a huge link can still leave the payload too big; the title gives way for it.
  fitted.title = cutToFit(fitted.title, (title) => jsonBytes({ ...fitted, title }) <= MAX_PUSH_PAYLOAD_BYTES);
  return fitted;
}

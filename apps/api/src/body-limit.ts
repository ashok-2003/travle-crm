// A cap on request bodies: no sign-in or tRPC call needs a big one, and the cap stops a client making the server read
// a huge one. It answers 413 as soon as a body passes maxSize bytes, before anything parses it. A few tRPC calls carry
// text a person pasted or a chat they exported (the AI's knowledge, a WhatsApp chat to learn from): called alone, they
// get a larger cap.
import type { MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";

export function limitBody(maxSize: number) {
  return bodyLimit({
    maxSize,
    onError: (c) => c.json({ code: "PAYLOAD_TOO_LARGE", message: "Request is too large" }, 413),
  });
}

/** The tRPC procedures whose input is long text, and their cap (Hindi and emojis take 3 to 4 bytes a character). */
const LONG_TEXT_PROCEDURES = new Set(["ai.learnVoice", "ai.learnChatVoice", "ai.addKnowledge", "ai.updateKnowledge"]);
const LONG_TEXT_LIMIT = 512 * 1024;

/** The tRPC cap: the usual one, or the larger one for a long-text procedure called on its own (not in a batch). */
export function limitTrpcBody(maxSize: number): MiddlewareHandler {
  const usual = limitBody(maxSize);
  const long = limitBody(LONG_TEXT_LIMIT);
  return (c, next) => {
    const procedure = c.req.path.split("/").at(-1) ?? "";
    return LONG_TEXT_PROCEDURES.has(procedure) ? long(c, next) : usual(c, next);
  };
}

// A cap on request bodies: no sign-in or tRPC call needs a big one, and the cap stops a client making the server read
// a huge one. It answers 413 as soon as a body passes maxSize bytes, before anything parses it.
import { bodyLimit } from "hono/body-limit";

export function limitBody(maxSize: number) {
  return bodyLimit({
    maxSize,
    onError: (c) => c.json({ code: "PAYLOAD_TOO_LARGE", message: "Request is too large" }, 413),
  });
}

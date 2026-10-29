// A fake api for the inbox's component tests that answers every call at once, by procedure, and records each call with its
// input: unlike organization/api.tsx, nothing waits for the test, so a whole screen can load.
import { vi } from "vitest";

export interface AnsweredCall {
  path: string;
  input: unknown;
}

type Handler = (input: unknown) => unknown;
/** An answer: its data, or a function of the call's input. */
type Answer = Handler | object | string | number | boolean | null;

export function answerApi(handlers: Record<string, Answer>) {
  const calls: AnsweredCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init: { body?: string }) => {
      const paths = decodeURIComponent(new URL(url, "http://localhost").pathname.replace("/api/trpc/", "")).split(",");
      const body = JSON.parse(init.body ?? "{}") as Record<string, unknown>;
      const items = paths.map((path, index) => {
        const input = body[String(index)];
        calls.push({ path, input });
        const handler = handlers[path];
        if (handler === undefined) {
          return { error: { message: "No answer", code: -32004, data: { code: "NOT_FOUND", httpStatus: 404 } } };
        }
        return { result: { data: typeof handler === "function" ? (handler as Handler)(input) : handler } };
      });
      return Promise.resolve(Response.json(items));
    }),
  );
  return { calls, of: (path: string) => calls.filter((call) => call.path === path) };
}

/** A chat message with every field a test does not care about filled in. */
export function aMessage(fields: Record<string, unknown> = {}) {
  return {
    id: "01900000-0000-7000-8000-0000000000m1".replace("m", "0"),
    direction: "in",
    origin: "customer",
    kind: "text",
    body: "Hello",
    caption: null,
    fileName: null,
    latitude: null,
    longitude: null,
    quoted: null,
    quoteDropped: false,
    reaction: null,
    status: "received",
    failureCode: null,
    mediaState: "none",
    sentBy: null,
    occurredAt: "2026-10-26T10:00:00.000Z",
    sentAt: null,
    deliveredAt: null,
    readAt: null,
    starred: false,
    ...fields,
  };
}

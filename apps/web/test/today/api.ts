// A stand-in for the api behind /api/trpc for Today's tests, which ask one procedure with several inputs (a page of
// each section): every call, batched or not, is answered by the test's `reply` from its procedure and input, and
// recorded in order. A reply is the data, a refusal with the api's reason, or no answer ever (a skeleton stays).
import { vi } from "vitest";

export interface Call {
  /** The procedure, e.g. "today.section". */
  path: string;
  input: unknown;
}

type Answered = { data: unknown } | { status: number; reason: string };

export type Reply = Answered | "never" | "offline";

const API_TRPC = "/api/trpc/";

const itemFor = (reply: Answered) =>
  "data" in reply
    ? { result: { data: reply.data } }
    : {
        error: {
          message: reply.reason,
          code: -32603,
          data: { code: "FORBIDDEN", httpStatus: reply.status, reason: reply.reason },
        },
      };

export function stubCalls(reply: (call: Call) => Reply): { calls: Call[] } {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input), "http://localhost");
      const paths = decodeURIComponent(url.pathname.slice(API_TRPC.length)).split(",");
      const sent = init?.method === "POST" ? init.body : url.searchParams.get("input");
      const inputs = JSON.parse(typeof sent === "string" ? sent : "{}") as Record<string, unknown>;
      const replies = paths.map((path, position) => {
        const call = { path, input: inputs[String(position)] };
        calls.push(call);
        return reply(call);
      });
      if (replies.includes("never")) return new Promise<Response>(() => undefined);
      const answered = replies.filter((each): each is Answered => typeof each !== "string");
      if (answered.length < replies.length) return Promise.reject(new TypeError("Failed to fetch"));
      const items = answered.map(itemFor);
      const [only] = items;
      const status = items.length === 1 && only && "error" in only ? only.error.data.httpStatus : 200;
      return Promise.resolve(Response.json(items, { status }));
    }),
  );
  return { calls };
}

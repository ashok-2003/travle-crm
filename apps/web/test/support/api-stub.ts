// A stand-in for the api behind /api, for tests that render the real data layer: tRPC's batched queries, the
// console's (/api/platform/trpc, recorded as "platform.<path>") and Better Auth's calls, answered from handlers a test
// sets, with every call recorded in the order it was made.
import { vi } from "vitest";
import { wantsStream, wireResponse, type WireItem } from "./trpc-wire";

/** What the api sends for one procedure: its data or a refusal (for an auth call, `reason` is Better Auth's code). */
type Sent = { data: unknown } | { status: number; reason?: string | null };

/**
 * An answer to one procedure: what is sent, no answer at all (offline), one that never comes (a stalled request), one
 * sent only once `until` settles (a slow connection the test controls), or one that depends on the call's input (a
 * board's column by its stage).
 */
export type Answer =
  Sent | "offline" | "never" | { until: Promise<unknown>; then: Sent } | ((input: unknown) => Answer);

/** An answer the test releases: `release()` sends `then`. */
export function heldAnswer(then: Sent): { answer: Answer; release: () => void } {
  let release: () => void = () => undefined;
  const until = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { answer: { until, then }, release };
}

export interface ApiStub {
  /** Procedure paths ("me.get", "platform.whoAmI") and auth calls ("auth/sign-out"), in call order. */
  calls: string[];
  /** Sets or replaces the answer for a procedure path, or for an auth call such as "auth/sign-out". */
  answer(path: string, answer: Answer): void;
}

function itemFor(answer: Sent): WireItem {
  if ("data" in answer) return { result: { data: answer.data } };
  return {
    error: {
      message: answer.reason ?? "Refused",
      code: -32001,
      data: { code: "FORBIDDEN", httpStatus: answer.status, reason: answer.reason ?? null },
    },
  };
}

const API_TRPC = "/api/trpc/";
const CONSOLE_TRPC = "/api/platform/trpc/";

export function stubApi(answers: Record<string, Answer>): ApiStub {
  const calls: string[] = [];
  const current = new Map(Object.entries(answers));
  const answerFor = (path: string): Answer => current.get(path) ?? { status: 404 };
  /** What to send, once any wait is over; null for no answer at all. */
  const settle = async (answer: Answer, input?: unknown): Promise<Sent | null> => {
    if (typeof answer === "function") return settle(answer(input));
    if (answer === "offline") return null;
    if (answer === "never") return new Promise<never>(() => undefined);
    if ("until" in answer) {
      await answer.until;
      return answer.then;
    }
    return answer;
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input), "http://localhost");
      if (url.pathname.startsWith("/api/auth/")) {
        const path = url.pathname.slice("/api/".length);
        calls.push(path);
        const sent = await settle(answerFor(path));
        if (sent === null) throw new TypeError("Failed to fetch");
        if ("data" in sent) return Response.json({});
        return Response.json(sent.reason ? { code: sent.reason } : {}, { status: sent.status });
      }
      const toConsole = url.pathname.startsWith(CONSOLE_TRPC);
      const paths = decodeURIComponent(url.pathname.slice((toConsole ? CONSOLE_TRPC : API_TRPC).length))
        .split(",")
        .map((path) => (toConsole ? `platform.${path}` : path));
      calls.push(...paths);
      // A batch's inputs by their place in it: in its body (a POST, as every call is) or its URL (a GET).
      const body = typeof init?.body === "string" ? init.body : url.searchParams.get("input");
      const inputs = (body ? JSON.parse(body) : {}) as Record<string, unknown>;
      const found = await Promise.all(paths.map((path, index) => settle(answerFor(path), inputs[String(index)])));
      const sent = found.filter((answer): answer is Sent => answer !== null);
      if (sent.length < found.length) throw new TypeError("Failed to fetch");
      const items = sent.map(itemFor);
      const [only] = items;
      const status = items.length === 1 && only && "error" in only ? only.error.data.httpStatus : 200;
      return wireResponse(items, wantsStream(init, input), status);
    }),
  );
  return {
    calls,
    answer: (path, answer) => {
      current.set(path, answer);
    },
  };
}

// A stand-in for the api behind /api, for tests that render the real data layer: tRPC's batched queries and Better
// Auth's sign-out, answered from handlers a test sets, with every call recorded in the order it was made.
import { vi } from "vitest";

/** What the api sends for one procedure: its data or a refusal (for an auth call, `reason` is Better Auth's code). */
type Sent = { data: unknown } | { status: number; reason?: string | null };

/**
 * An answer to one procedure: what is sent, no answer at all (offline), one that never comes (a stalled request), or
 * one sent only once `until` settles (a slow connection the test controls).
 */
export type Answer = Sent | "offline" | "never" | { until: Promise<unknown>; then: Sent };

/** An answer the test releases: `release()` sends `then`. */
export function heldAnswer(then: Sent): { answer: Answer; release: () => void } {
  let release: () => void = () => undefined;
  const until = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { answer: { until, then }, release };
}

export interface ApiStub {
  /** Procedure paths ("me.get") and "auth/sign-out", in call order. */
  calls: string[];
  /** Sets or replaces the answer for a procedure path, or for "auth/sign-out". */
  answer(path: string, answer: Answer): void;
}

function itemFor(answer: Sent) {
  if ("data" in answer) return { result: { data: answer.data } };
  return {
    error: {
      message: answer.reason ?? "Refused",
      code: -32001,
      data: { code: "FORBIDDEN", httpStatus: answer.status, reason: answer.reason ?? null },
    },
  };
}

export function stubApi(answers: Record<string, Answer>): ApiStub {
  const calls: string[] = [];
  const current = new Map(Object.entries(answers));
  const answerFor = (path: string): Answer => current.get(path) ?? { status: 404 };
  /** What to send, once any wait is over; null for no answer at all. */
  const settle = async (answer: Answer): Promise<Sent | null> => {
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
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : String(input), "http://localhost");
      if (url.pathname.startsWith("/api/auth/")) {
        const path = url.pathname.slice("/api/".length);
        calls.push(path);
        const sent = await settle(answerFor(path));
        if (sent === null) throw new TypeError("Failed to fetch");
        if ("data" in sent) return Response.json({});
        return Response.json(sent.reason ? { code: sent.reason } : {}, { status: sent.status });
      }
      const paths = decodeURIComponent(url.pathname.slice("/api/trpc/".length)).split(",");
      calls.push(...paths);
      const found = await Promise.all(paths.map((path) => settle(answerFor(path))));
      const sent = found.filter((answer): answer is Sent => answer !== null);
      if (sent.length < found.length) throw new TypeError("Failed to fetch");
      const items = sent.map(itemFor);
      const [only] = items;
      const status = items.length === 1 && only && "error" in only ? only.error.data.httpStatus : 200;
      return Response.json(items, { status });
    }),
  );
  return {
    calls,
    answer: (path, answer) => {
      current.set(path, answer);
    },
  };
}

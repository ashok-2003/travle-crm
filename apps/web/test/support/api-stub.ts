// A stand-in for the api behind /api, for tests that render the real data layer: tRPC's batched queries and Better
// Auth's sign-out, answered from handlers a test sets, with every call recorded in the order it was made.
import { vi } from "vitest";

/** An answer to one procedure: its data, a refusal, or no answer at all (offline). */
export type Answer = { data: unknown } | { status: number; reason?: string | null } | "offline";

export interface ApiStub {
  /** Procedure paths ("me.get") and "auth/sign-out", in call order. */
  calls: string[];
  /** Sets or replaces the answer for a procedure path, or for "auth/sign-out". */
  answer(path: string, answer: Answer): void;
}

function itemFor(answer: Exclude<Answer, "offline">) {
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
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : String(input), "http://localhost");
      if (url.pathname.startsWith("/api/auth/")) {
        const path = url.pathname.slice("/api/".length);
        calls.push(path);
        const answer = answerFor(path);
        if (answer === "offline") return Promise.reject(new TypeError("Failed to fetch"));
        return Promise.resolve(Response.json({}, { status: "data" in answer ? 200 : answer.status }));
      }
      const paths = decodeURIComponent(url.pathname.slice("/api/trpc/".length)).split(",");
      calls.push(...paths);
      const found = paths.map(answerFor);
      if (found.includes("offline")) return Promise.reject(new TypeError("Failed to fetch"));
      const items = found.map((answer) => itemFor(answer as Exclude<Answer, "offline">));
      const [only] = items;
      const status = items.length === 1 && only && "error" in only ? only.error.data.httpStatus : 200;
      return Promise.resolve(Response.json(items, { status }));
    }),
  );
  return {
    calls,
    answer: (path, answer) => {
      current.set(path, answer);
    },
  };
}

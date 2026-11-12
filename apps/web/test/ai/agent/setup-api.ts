// An api for the Setup tab's tests: answers each procedure from a map and records what each call was sent, so a test
// can check the exact input a save made (stubApi in test/support records only the paths).
import { vi } from "vitest";
import { wantsStream, wireResponse, type WireItem } from "../../support/trpc-wire";

export type Answer = { data: unknown } | { status: number; reason: string } | { until: Promise<unknown>; then: Answer };

/** An answer the test releases: `release()` sends `then`. */
export function heldAnswer(then: Answer = { data: null }): { answer: Answer; release: () => void } {
  let release: () => void = () => undefined;
  const until = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { answer: { until, then }, release };
}
export interface Recorded {
  path: string;
  input: unknown;
}

export function recordingApi(answers: Record<string, Answer>) {
  const calls: Recorded[] = [];
  const current = new Map(Object.entries(answers));
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input), "http://localhost");
      const paths = decodeURIComponent(url.pathname.slice("/api/trpc/".length)).split(",");
      const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : {};
      const respond = async (path: string, index: number): Promise<WireItem> => {
        calls.push({ path, input: body[String(index)] });
        let answer = current.get(path) ?? { status: 404, reason: "NOT_FOUND" };
        while ("until" in answer) {
          await answer.until;
          answer = answer.then;
        }
        if ("data" in answer) return { result: { data: answer.data } };
        return {
          error: {
            message: answer.reason,
            code: -32001,
            data: { code: "FORBIDDEN", httpStatus: answer.status, reason: answer.reason },
          },
        };
      };
      return Promise.all(paths.map(respond)).then((items) => {
        const [only] = items;
        const status = items.length === 1 && only && "error" in only ? only.error.data.httpStatus : 200;
        return wireResponse(items, wantsStream(init, input), status);
      });
    }),
  );
  return {
    calls,
    answer: (path: string, answer: Answer) => {
      current.set(path, answer);
    },
    sent: (path: string) => calls.filter((call) => call.path === path).map((call) => call.input),
  };
}

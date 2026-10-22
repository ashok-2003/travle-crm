// A fake Cloudflare Turnstile for the journeys (plan F7): the siteverify endpoint over HTTP, which the api's real adapter
// reaches through TURNSTILE_VERIFY_URL, and the browser script that stands in for Cloudflare's, which makes tokens. The
// token itself says how the fake answers ("pass-…", "fail-…", "error-…"), so tests that run at once never share a switch.
// Like Cloudflare, it accepts a token only once. Nothing here is ever sent to Cloudflare.
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

export type TurnstileAnswer = "pass" | "fail" | "error";

/** A token the fake will answer as asked, and never saw before. */
export function turnstileTokenFor(answer: TurnstileAnswer): string {
  return `${answer}-${randomUUID()}`;
}

export interface FakeTurnstile {
  /** The siteverify address the api is given as TURNSTILE_VERIFY_URL. */
  verifyUrl: string;
  /** The tokens the api asked about so far, in order. */
  verified(): string[];
  stop(): Promise<void>;
}

export async function startFakeTurnstile(): Promise<FakeTurnstile> {
  const seen: string[] = [];
  const spent = new Set<string>();
  const server = createServer((request, response) => {
    void (async () => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(chunk as Buffer);
      const form = new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
      const token = form.get("response") ?? "";
      if (request.url === "/verified") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify(seen));
        return;
      }
      seen.push(token);
      const reply = (status: number, body: unknown) => {
        response.writeHead(status, { "content-type": "application/json" });
        response.end(JSON.stringify(body));
      };
      if (token.startsWith("error-")) {
        reply(500, { "error-codes": ["internal-error"] });
      } else if (spent.has(token)) {
        reply(200, { success: false, "error-codes": ["timeout-or-duplicate"] });
      } else if (token.startsWith("pass-")) {
        spent.add(token);
        reply(200, { success: true });
      } else {
        spent.add(token);
        reply(200, { success: false, "error-codes": ["invalid-input-response"] });
      }
    })();
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("the fake Turnstile has no port");
  const url = `http://127.0.0.1:${String(address.port)}`;
  return {
    verifyUrl: `${url}/siteverify`,
    verified: () => [...seen],
    stop: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => {
          resolve();
        });
      }),
  };
}

/** The tokens the fake at `verifyUrl` was asked about, for the journeys' own processes (E2E_TURNSTILE_URL). */
export async function verifiedTokens(verifyUrl: string): Promise<string[]> {
  const response = await fetch(new URL("/verified", verifyUrl), { method: "POST" });
  return (await response.json()) as string[];
}

/**
 * Cloudflare's browser script, as a page loads it: render() gives a token a moment later, reset() a new one, and each reset is
 * counted in window.__turnstile.resets. `answer` is how the fake siteverify will judge every token this page makes.
 */
export function turnstileScript(answer: TurnstileAnswer): string {
  return `
(() => {
  const state = { renders: 0, resets: 0, removed: 0 };
  window.__turnstile = state;
  const widgets = new Map();
  const make = () => ${JSON.stringify(answer)} + "-" + crypto.randomUUID();
  const give = (id) => setTimeout(() => widgets.get(id)?.callback(make()), 60);
  window.turnstile = {
    render(element, options) {
      const id = "widget-" + (state.renders += 1);
      widgets.set(id, options);
      element.dataset.turnstile = id;
      give(id);
      return id;
    },
    reset(id) { state.resets += 1; give(id); },
    remove(id) { state.removed += 1; widgets.delete(id); },
  };
})();`;
}

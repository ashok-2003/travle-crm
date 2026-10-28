// A fake OpenRouter for the journeys (ADR 0029): answers a chat completion with one scripted reply and keeps the requests it
// was sent, so a journey can read what the prompt held and that zero data retention was asked for. /_requests lists them;
// /_say sets the next reply. The api is given its address as AI_TEST_SERVER_URL, so the real adapter runs against it; nothing
// here reaches OpenRouter.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

/** The test key the api runs with in the journeys. */
export const OPENROUTER_E2E_KEY = "sk-or-e2e-test-key-0123456789abcdef";

export interface FakeOpenRouter {
  url: string;
  stop(): Promise<void>;
}

const readBody = (request: IncomingMessage) =>
  new Promise<string>((resolve) => {
    let text = "";
    request.on("data", (chunk: Buffer) => (text += chunk.toString()));
    request.on("end", () => {
      resolve(text);
    });
  });

export async function startFakeOpenRouter(): Promise<FakeOpenRouter> {
  const requests: { authorization: string | undefined; body: unknown }[] = [];
  let next =
    "Namaste! Thank you for writing to us. Which dates are you planning to travel, and how many of you are going?";
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    void (async () => {
      const path = request.url ?? "";
      if (request.method === "GET" && path === "/_requests") {
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify(requests));
        return;
      }
      if (request.method === "POST" && path === "/_say") {
        next = (JSON.parse(await readBody(request)) as { text: string }).text;
        response.end("ok");
        return;
      }
      if (request.method === "POST" && path.endsWith("/chat/completions")) {
        requests.push({
          authorization: request.headers.authorization,
          body: JSON.parse(await readBody(request)) as unknown,
        });
        response.setHeader("content-type", "application/json");
        // The autopilot's call (its prompt says it is the agency's sales agent) is answered with its JSON; any other call that
        // asks for JSON is a lead's scoring, answered with a guess; the rest are suggested replies.
        const messages = (requests.at(-1)?.body as { messages?: { content: string }[] } | undefined)?.messages ?? [];
        const autopilot = messages[0]?.content.includes("WhatsApp travel sales agent") === true;
        const scoring =
          (requests.at(-1)?.body as { response_format?: unknown } | undefined)?.response_format !== undefined;
        const content = autopilot
          ? JSON.stringify({
              reply: "Namaste! Kerala 5 nights is Rs 18,500 per person. Which dates are you planning?",
              handoff: false,
              handoffReason: "",
              attention: "",
              memory: "Wants Kerala for 4.",
              followUp: { needed: false, inHours: 4, why: "" },
            })
          : scoring
            ? JSON.stringify({
                score: 78,
                label: "hot",
                reasons: ["Asked about a Kerala package for four"],
                fake: false,
                fakeReason: "",
                nextStep: "Call today and offer the Kerala 5-night package.",
                facts: { destination: "Kerala", when: "December", travellers: "4 adults", budget: null },
              })
            : next;
        response.end(
          JSON.stringify({ model: "fake/model", choices: [{ message: { content }, finish_reason: "stop" }] }),
        );
        return;
      }
      response.statusCode = 404;
      response.end();
    })();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("the fake OpenRouter has no port");
  return {
    url: `http://127.0.0.1:${String(address.port)}`,
    stop: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => {
          resolve();
        });
      }),
  };
}

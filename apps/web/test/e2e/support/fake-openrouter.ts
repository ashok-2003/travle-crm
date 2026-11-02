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

/** What the fake "reads" for "Fill it for me": one scripted answer per form, whatever was said, shown or recorded. */
function filled(user: string): object {
  if (user.includes("A new lead.")) {
    const profile = /WhatsApp name is ([^.\\"]+)\./.exec(user)?.[1];
    return {
      // From a chat the number and the name are the chat's own; from words, they are said.
      ...(user.includes("The chat, oldest first") ? { name: profile } : { name: "Rahul Sharma", phone: "98765 43210" }),
      destination: "Manali",
      dateFrom: "15 Dec",
      dateTo: "20 Dec",
      adults: 4,
      budget: "1 lakh",
      budgetBasis: "for_everyone",
      excerpts: { destination: "Manali jana hai", budget: "1 lakh tak" },
      questions: [],
    };
  }
  if (user.includes("What was said after a call")) {
    return {
      outcome: "spoke",
      note: "Rahul wants Manali for four adults in December and can spend about one lakh.",
      followUpDay: "kal",
      followUpTime: "5 pm",
      followUpTitle: "Send the Manali quote",
      destination: "Manali",
      adults: 4,
      excerpts: { followUpDay: "kal shaam 5 baje call karna", destination: "Manali" },
      questions: [],
    };
  }
  if (user.includes("A quotation's text")) {
    return {
      title: "Manali for four",
      startDate: "15 Dec",
      adults: 4,
      children: 0,
      days: [
        { title: "Arrive in Manali", description: "Pick-up from Chandigarh" },
        { title: "Solang Valley", description: "Snow activities" },
      ],
      // A price the model was never asked for: the fill must not carry it.
      items: [
        { description: "Hotel, 5 nights", detail: "Deluxe room", quantity: 5, unitPricePaise: 900_000, price: "9000" },
      ],
      inclusions: "Breakfast and transfers",
      exclusions: "Flights",
      excerpts: { title: "Manali for four", inclusions: "Breakfast and transfers" },
      questions: [],
    };
  }
  return { adults: 3, roomType: "Twin beds", excerpts: { adults: "3 log" }, questions: [] };
}

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
        const messages = (requests.at(-1)?.body as { messages?: { content: unknown }[] } | undefined)?.messages ?? [];
        const system = typeof messages[0]?.content === "string" ? messages[0].content : "";
        const user = JSON.stringify(messages[1]?.content ?? "");
        const fill = system.includes("FILL_FORM");
        const autopilot = system.includes("WhatsApp travel sales agent");
        const scoring =
          (requests.at(-1)?.body as { response_format?: unknown } | undefined)?.response_format !== undefined;
        const content = fill
          ? JSON.stringify(filled(user))
          : autopilot
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
                  summary: "Wants a Kerala package for four in December and has asked the price.",
                  nextStep: "Call today and offer the Kerala 5-night package.",
                  facts: { destination: "Kerala", when: "December", travellers: "4 adults", budget: null },
                  // Asked for only while a new lead's empty fields are being filled in from its first messages.
                  ...(system.includes('"trip"')
                    ? {
                        trip: {
                          destination: "Manali",
                          dateFrom: "15 Dec",
                          dateTo: "20 Dec",
                          adults: 4,
                          budget: "1 lakh",
                          budgetBasis: "for_everyone",
                          excerpts: { destination: "Manali jana hai", budget: "1 lakh tak" },
                        },
                      }
                    : {}),
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

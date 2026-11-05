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

/**
 * Draft the days: as many days as the prompt asks for, and an amount on the first, which the product must take out. A day is
 * taken from the agency's own plan when the prompt gives one.
 */
function draftedDays(user: string): object {
  const count = Number(/Days: (\d+)/.exec(user)?.[1] ?? "3");
  const fromPlan = user.includes("The agency's own plans for this place");
  return {
    days: Array.from({ length: count }, (_, index) => ({
      title:
        index === 0
          ? "Arrive in Manali"
          : `Day ${String(index + 1)}: ${fromPlan ? "Solang Valley" : "Local sightseeing"}`,
      description:
        index === 0 ? "Check in and rest. The hotel is Rs 4,500 a night." : "A relaxed day with time to spare.",
    })),
    questions: [],
  };
}

/** The first line of a passport's machine-readable zone, and the second, with every check digit right. */
const MRZ_LINE_1 = "P<INDSHARMA<<RAHUL<<<<<<<<<<<<<<<<<<<<<<<<<<";
const MRZ_LINE_2 = "Z1234567<1IND8006123M3501014<<<<<<<<<<<<<<00";

/** Travellers: a passport photo reads as one passport; a voice note, a list or a photo of a list as a family. */
function readTravellers(user: string): object {
  if (user.includes("image_url")) {
    return {
      people: [
        {
          name: "Rahul Sharma",
          idKind: "passport",
          mrzLine1: MRZ_LINE_1,
          mrzLine2: MRZ_LINE_2,
          issueDate: "02/01/2025",
        },
      ],
      questions: [],
    };
  }
  return {
    people: [
      { name: "Ramesh Sharma", dateOfBirth: "12 June 1980", gender: "male" },
      { name: "Sunita Sharma", gender: "female", roomRequest: "ground floor", roomNote: "needs a ground-floor room" },
      { name: "Aarav", age: 12 },
    ],
    questions: [],
  };
}

/** The quote write-up: tokens for the total, the advance and the link, a price the model was told never to type, in the language asked. */
function writtenUp(user: string): string {
  const hindi = user.includes("Language: Hindi");
  const email = user.includes("For email:");
  return [
    email ? "Subject: Your Manali plan" : "",
    hindi ? "नमस्ते Rahul जी! आपका मनाली का प्लान तैयार है।" : "Hi Rahul! Your Manali plan is ready.",
    hindi ? "यह सिर्फ Rs. 55,555 प्रति व्यक्ति है।" : "It is only Rs. 55,555 per person.",
    hindi ? "कुल: {total}" : "Total: {total}",
    hindi ? "बुक करने के लिए अग्रिम: {advance}" : "Advance to book: {advance}",
    hindi ? "पूरा क्वोट यहाँ देखें: {link}" : "See the full quote: {link}",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

/** Ask reports: Instagram leads last month are answered by the sources report; anything else is declined with the nearest reports. */
function chosenReport(user: string): object {
  // Only the question is read: the catalogue the model is shown names Instagram too.
  if (user.split("The question:")[1]?.includes("Instagram"))
    return { queryId: "leads_by_source", params: { range: "last_month" } };
  return { cannot: "not about the reports", closest: ["lost_leads", "quotes"] };
}

/**
 * Rooming requests: each traveller line in the prompt whose note speaks of the ground floor or a room alone is read as that
 * request, with the words copied from the note; a traveller the note says nothing about is left out.
 */
function readRequests(user: string): object {
  const requests = [...user.matchAll(/(B\d+T\d+): [^\\"]*?note about their room: \\"([^"\\]*)\\"/g)].flatMap(
    ([, traveller, note]) => {
      const words = note ?? "";
      if (/ground floor/i.test(words)) return [{ traveller, request: "ground_floor", excerpt: words }];
      if (/room (to )?(myself|alone)|single room/i.test(words))
        return [{ traveller, request: "single_room", excerpt: words }];
      return [];
    },
  );
  return { requests };
}

/**
 * A rate sheet: each numbered line of the prompt shaped "L2 [Sheet1, row 2] A: Deluxe room | B: MAP | C: 4,500" is read as a room
 * at that price (at most three a call), under one season whose dates are far enough ahead never to be past. The price is copied
 * as printed, as the AI is told to. A line with no number in column C is not a rate.
 */
function readRates(user: string): object {
  const rates = [...user.matchAll(/(L\d+) \[[^\]]*\] A: ([^|\\"]+?) \| B: ([^|\\"]+?) \| C: ([\d,]+)/g)]
    .slice(0, 3)
    .map(([, line, item, plan, price]) => ({
      season: 0,
      item,
      mealPlan: plan,
      occupancy: "double",
      unit: "per_room_night",
      price,
      note: "",
      line,
    }));
  return {
    seasons: [{ label: "Winter 2030-31", from: "1 Oct 2030", to: "31 Mar 2031", line: null }],
    rates,
    questions: [],
  };
}

/** The numbered lines of a package draft's prompt, "[P1.L2] text", as token and text pairs. */
const numberedLines = (user: string) =>
  [...user.matchAll(/\[(P\d+\.L\d+)\] ([^\\"]*)/g)].map(([, token, text]) => ({
    token: token ?? "",
    text: text ?? "",
  }));

/** Find trips: one trip, "Manali 5 Nights 6 Days", described by every numbered line the prompt holds. */
function foundTrips(user: string): object {
  const lines = numberedLines(user).map((line) => line.token);
  return { trips: [{ name: "Manali 5 Nights 6 Days", place: "Manali", nights: 5, lines }] };
}

/**
 * Draft a package: each field cites the lines that say it. The triple price is cited from two lines that print different figures,
 * so the draft keeps both; every figure is copied as printed.
 */
function draftedPackage(user: string): object {
  const lines = numberedLines(user);
  const tokensOf = (pattern: RegExp) => lines.filter((line) => pattern.test(line.text)).map((line) => line.token);
  const priceOf = (text: string) => /Rs ([\d,]+\/-)/.exec(text)?.[1] ?? "";
  const pricesFor = (room: string) =>
    lines
      .filter((line) => new RegExp(`${room} sharing`, "i").test(line.text))
      .map((line) => ({ room, printed: priceOf(line.text), tokens: [line.token] }));
  const named = tokensOf(/Manali 5 Nights/);
  return {
    name: { value: "Manali 5N6D", tokens: named },
    title: { value: "Manali 5 Nights 6 Days", tokens: named },
    destination: { value: "Manali", tokens: named },
    nights: { value: 5, tokens: named },
    roomTypes: { value: ["double", "triple"], tokens: tokensOf(/sharing/i) },
    weeklyDays: [{ value: ["Friday", "Saturday"], tokens: tokensOf(/Friday/) }],
    departureMonths: { value: null, tokens: [] },
    seasons: [
      {
        label: "Regular",
        fromMonth: 1,
        toMonth: 12,
        tokens: named,
        prices: [...pricesFor("Double"), ...pricesFor("Triple")],
      },
    ],
    advancePerPerson: tokensOf(/Advance/).map((token) => ({ printed: "2,000/-", tokens: [token] })),
  };
}

/** An empty-seats message: the person's first name, a seat count and an amount the model must not type, and the price token. */
function reachedOut(user: string): string {
  // The first name sits in the data fence with the agency's name, after "First name:".
  const name = /[Ff]irst name: ([^\\\n<]+?)(?:\\n|<|$)/.exec(user)?.[1]?.trim() ?? "there";
  return [
    `Hi ${name}! You asked us about Spiti, and our group leaves soon with only 4 seats left.`,
    "It is just Rs 9,999 for you.",
    "The price is {price}. Reply here if you would like to join!",
  ].join("\n");
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
        const writeUp = system.includes("WRITE_UP.");
        const askReport = system.includes("ASK_REPORT.");
        const readRequestsCall = system.includes("READ_REQUESTS.");
        const readRatesCall = system.includes("READ_RATES.");
        const reachOut = system.includes("REACH_OUT.");
        const findTripsCall = system.includes("FIND_TRIPS.");
        const draftPackageCall = system.includes("DRAFT_PACKAGE.");
        const draftDays = system.includes("DRAFT_DAYS:");
        const travellers = system.includes("FILL_TRAVELLERS:");
        const autopilot = system.includes("WhatsApp travel sales agent");
        const scoring =
          (requests.at(-1)?.body as { response_format?: unknown } | undefined)?.response_format !== undefined;
        const content = findTripsCall
          ? JSON.stringify(foundTrips(user))
          : draftPackageCall
            ? JSON.stringify(draftedPackage(user))
            : readRatesCall
              ? JSON.stringify(readRates(user))
              : draftDays
                ? JSON.stringify(draftedDays(user))
                : travellers
                  ? JSON.stringify(readTravellers(user))
                  : readRequestsCall
                    ? JSON.stringify(readRequests(user))
                    : reachOut
                      ? reachedOut(user)
                      : writeUp
                        ? writtenUp(user)
                        : askReport
                          ? JSON.stringify(chosenReport(user))
                          : fill
                            ? JSON.stringify(filled(user))
                            : autopilot
                              ? JSON.stringify({
                                  reply:
                                    "Namaste! Kerala 5 nights is Rs 18,500 per person. Which dates are you planning?",
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
                                    facts: {
                                      destination: "Kerala",
                                      when: "December",
                                      travellers: "4 adults",
                                      budget: null,
                                    },
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

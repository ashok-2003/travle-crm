// A fake MSG91 for the journeys (spec 12): a customer's photo at the link an inbound message carried, and the send call (it
// records the message and answers with a message id, or refuses once for a customer the journey names); /_sent lists what a
// journey's customer was sent. Every other path answers an empty 200. The api, worker and console are given its
// address as MSG91_TEST_SERVER_URL, so the real adapter runs against it; nothing here is ever sent to MSG91.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { deflateSync } from "node:zlib";
import { pngChunk, pngHeader, pngOf } from "@travel-crm/integrations/testing";

/** The three MSG91 settings the api, worker and console run with in the journeys: test values, for this run only. */
export const MSG91_E2E = {
  authKey: "e2e-msg91-auth-key-0123456789",
  webhookToken: "e2e0msg91webhooktoken0123456789abcdef0123",
  webhookKey: "e2e-msg91-webhook-key-0123456789-abcdefghij",
} as const;

/** A real 240x160 picture (a warm gradient), so a shot of the chat shows a photograph and not a dot. */
function photoPng(): Uint8Array {
  const width = 240;
  const height = 160;
  const rows = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y += 1) {
    const row = y * (1 + width * 3);
    for (let x = 0; x < width; x += 1) {
      rows[row + 1 + x * 3] = 200 - Math.floor((y * 80) / height);
      rows[row + 2 + x * 3] = 150 + Math.floor((x * 60) / width);
      rows[row + 3 + x * 3] = 110 + Math.floor((y * 90) / height);
    }
  }
  return pngOf(
    pngChunk("IHDR", pngHeader(width, height, { bitDepth: 8, colourType: 2 })),
    pngChunk("IDAT", deflateSync(rows)),
    pngChunk("IEND", new Uint8Array()),
  );
}

/** One message the product asked this fake to send, as the journeys read it back from /_sent. */
export interface FakeSent {
  wamid: string;
  /** The customer's number, digits. */
  to: string;
  /** Our number, digits. */
  from: string;
  contentType: string;
  text: string | null;
  url: string | null;
  caption: string | null;
  fileName: string | null;
}

const OUTBOUND_PATH = "/api/v5/whatsapp/whatsapp-outbound-message/";

async function bodyOf(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

const textOrNull = (value: unknown) => (typeof value === "string" && value !== "" ? value : null);
const textOf = (value: unknown) => textOrNull(value) ?? "";

export interface FakeMsg91 {
  /** The base URL the processes are given as MSG91_TEST_SERVER_URL. */
  url: string;
  /** The link a customer's photo has, as an inbound message carries it. */
  photoUrl: string;
  stop(): Promise<void>;
}

export async function startFakeMsg91(): Promise<FakeMsg91> {
  const photo = Buffer.from(photoPng());
  const sent: FakeSent[] = [];
  /** Customers whose next message is refused as "not on WhatsApp" (Meta's 131026), once. */
  const refuseNext = new Set<string>();
  const server = createServer((request, response) => {
    void handle(request, response);
  });
  const handle = async (request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? "/", "http://fake");
    if (request.method === "POST" && url.pathname === OUTBOUND_PATH) {
      const body = await bodyOf(request);
      const to = textOf(body.recipient_number);
      if (refuseNext.delete(to)) {
        response.writeHead(400, { "content-type": "application/json" });
        response.end(JSON.stringify({ status: "fail", error: { code: "131026" } }));
        return;
      }
      const wamid = `wamid.fake-${crypto.randomUUID()}`;
      sent.push({
        wamid,
        to,
        from: textOf(body.integrated_number),
        contentType: textOf(body.content_type),
        text: textOrNull(body.text),
        url: textOrNull(body.url),
        caption: textOrNull(body.caption),
        fileName: textOrNull(body.filename),
      });
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ status: "success", data: { messages: [{ id: wamid }], request_id: wamid } }));
      return;
    }
    if (url.pathname === "/_sent") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(sent.filter((message) => message.to === url.searchParams.get("to"))));
      return;
    }
    if (request.method === "POST" && url.pathname === "/_refuse-next") {
      refuseNext.add(url.searchParams.get("to") ?? "");
      response.writeHead(200, { "content-type": "application/json" });
      response.end("{}");
      return;
    }
    if (request.url === "/media/photo.png") {
      response.writeHead(200, { "content-type": "image/png", "content-length": String(photo.byteLength) });
      response.end(photo);
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end("{}");
  };
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("the fake MSG91 has no port");
  const url = `http://127.0.0.1:${String(address.port)}`;
  return {
    url,
    photoUrl: `${url}/media/photo.png`,
    stop: () =>
      new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      }),
  };
}

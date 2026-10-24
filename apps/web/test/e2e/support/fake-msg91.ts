// A fake MSG91 for the journeys (spec 12): the one thing the product fetches from it in part 1, a customer's photo at the link
// an inbound message carried, over HTTP; every other path answers an empty 200. The api, worker and console are given its
// address as MSG91_TEST_SERVER_URL, so the real adapter runs against it; nothing here is ever sent to MSG91.
import { createServer } from "node:http";
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

export interface FakeMsg91 {
  /** The base URL the processes are given as MSG91_TEST_SERVER_URL. */
  url: string;
  /** The link a customer's photo has, as an inbound message carries it. */
  photoUrl: string;
  stop(): Promise<void>;
}

export async function startFakeMsg91(): Promise<FakeMsg91> {
  const photo = Buffer.from(photoPng());
  const server = createServer((request, response) => {
    if (request.url === "/media/photo.png") {
      response.writeHead(200, { "content-type": "image/png", "content-length": String(photo.byteLength) });
      response.end(photo);
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end("{}");
  });
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

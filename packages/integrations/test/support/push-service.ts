// A stand-in for a browser's push service: a local HTTP server that records what it receives, and a subscriber whose
// keys can decrypt it (RFC 8291, aes128gcm), so tests prove a browser could read the notification.
import { createDecipheriv, createECDH, hkdfSync, randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";

export interface ReceivedPush {
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
}

export interface PushService {
  /** A subscription endpoint on this server, e.g. http://127.0.0.1:1234/push/<name>. */
  endpoint(name: string): string;
  readonly received: ReceivedPush[];
  /** The status the next requests get (201 by default). */
  answerWith(status: number): void;
  close(): Promise<void>;
}

export async function startPushService(): Promise<PushService> {
  const received: ReceivedPush[] = [];
  let status = 201;
  const server: Server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      received.push({
        method: request.method ?? "",
        path: request.url ?? "",
        headers: request.headers,
        body: Buffer.concat(chunks),
      });
      response.writeHead(status, status >= 300 && status < 400 ? { location: "/elsewhere" } : {}).end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("The push service has no port");

  return {
    endpoint: (name) => `http://127.0.0.1:${String(address.port)}/push/${name}`,
    received,
    answerWith: (next) => {
      status = next;
    },
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      }),
  };
}

/** A browser's side of a subscription: the keys it gives the server, and the decryption it does on receipt. */
export function createSubscriber() {
  const ecdh = createECDH("prime256v1");
  const publicKey = ecdh.generateKeys();
  const authSecret = randomBytes(16);
  return {
    keys: { p256dh: publicKey.toString("base64url"), auth: authSecret.toString("base64url") },
    /** Decrypts an aes128gcm body: salt (16) | record size (4) | key id length (1) | sender's key | ciphertext. */
    decrypt(body: Buffer): string {
      const salt = body.subarray(0, 16);
      const keyIdLength = body.readUInt8(20);
      const senderKey = body.subarray(21, 21 + keyIdLength);
      const ciphertext = body.subarray(21 + keyIdLength);
      const sharedSecret = ecdh.computeSecret(senderKey);
      const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), publicKey, senderKey]);
      const inputKey = Buffer.from(hkdfSync("sha256", sharedSecret, authSecret, keyInfo, 32));
      const contentKey = Buffer.from(hkdfSync("sha256", inputKey, salt, "Content-Encoding: aes128gcm\0", 16));
      const nonce = Buffer.from(hkdfSync("sha256", inputKey, salt, "Content-Encoding: nonce\0", 12));
      const decipher = createDecipheriv("aes-128-gcm", contentKey, nonce);
      decipher.setAuthTag(ciphertext.subarray(-16));
      const padded = Buffer.concat([decipher.update(ciphertext.subarray(0, -16)), decipher.final()]);
      // The last record ends with the 0x02 delimiter, then zero or more 0x00 bytes of padding.
      return padded.subarray(0, padded.lastIndexOf(2)).toString("utf8");
    },
  };
}

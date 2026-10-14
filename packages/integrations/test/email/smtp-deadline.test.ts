// The overall SMTP deadline really ends the connection. Runs against a real TCP server that speaks just enough SMTP to
// accept a message and then answers the DATA command one byte at a time, forever: nodemailer's own socket timeout
// restarts on every byte, so only our deadline can stop the send.
import { createServer, type Server, type Socket } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createSmtpEmailSender } from "../../src/email/index.js";

interface TricklingServer {
  port: number;
  /** Resolves when the server sees a client socket close, with the time it took from `since`. */
  closedWithin(since: number): Promise<number>;
  readonly sawEndOfMessage: () => boolean;
  stop(): Promise<void>;
}

async function startTricklingServer(): Promise<TricklingServer> {
  const sockets = new Set<Socket>();
  const timers = new Set<NodeJS.Timeout>();
  let endOfMessage = false;
  let closedAt: number | undefined;
  let onClosed: (() => void) | undefined;
  const server: Server = createServer((socket) => {
    sockets.add(socket);
    socket.on("error", () => undefined);
    socket.on("close", () => {
      closedAt = Date.now();
      onClosed?.();
    });
    let buffered = "";
    socket.write("220 trickle ESMTP\r\n");
    socket.on("data", (chunk: Buffer) => {
      buffered += chunk.toString("latin1");
      if (buffered.includes("\r\n.\r\n")) endOfMessage = true;
      for (const line of buffered.split("\r\n").slice(0, -1)) {
        if (/^EHLO/i.test(line)) socket.write("250-trickle\r\n250 8BITMIME\r\n");
        else if (/^(MAIL|RCPT)/i.test(line)) socket.write("250 ok\r\n");
        else if (/^DATA/i.test(line)) {
          // A reply that never ends: "354-x" lines, one byte every 50 ms.
          let position = 0;
          const timer = setInterval(() => {
            if (!socket.destroyed) socket.write("354-x\r\n"[position++ % 7] ?? "x");
          }, 50);
          timers.add(timer);
        }
      }
      buffered = buffered.slice(buffered.lastIndexOf("\r\n") + 2);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("No port");

  return {
    port: address.port,
    closedWithin: (since) =>
      new Promise((resolve) => {
        if (closedAt !== undefined) resolve(closedAt - since);
        else {
          onClosed = () => {
            resolve((closedAt ?? Date.now()) - since);
          };
        }
      }),
    sawEndOfMessage: () => endOfMessage,
    stop: async () => {
      for (const timer of timers) clearInterval(timer);
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      });
    },
  };
}

describe("SMTP deadline against a server that trickles", () => {
  let server: TricklingServer | undefined;

  afterEach(async () => {
    await server?.stop();
  });

  it("rejects with the retryable timeout and has the connection closed soon after", { timeout: 5000 }, async () => {
    server = await startTricklingServer();
    const sender = createSmtpEmailSender({
      host: "127.0.0.1",
      port: server.port,
      secure: false,
      fromAddress: "no-reply@example.test",
      sendTimeoutMs: 300,
    });
    const startedAt = Date.now();

    const error: unknown = await sender
      .send({
        to: { address: "asha@agency.example" },
        fromName: "Sharma Travels",
        subject: "Hello",
        text: "Hi",
        html: "<p>Hi</p>",
      })
      .catch((caught: unknown) => caught);

    expect(error).toMatchObject({ code: "ESENDTIMEOUT" });
    expect(Date.now() - startedAt).toBeLessThan(1500);
    // The server must see the client go away: a send abandoned but still running could deliver after the retry.
    expect(await server.closedWithin(startedAt + 300)).toBeLessThan(1000);
    expect(server.sawEndOfMessage()).toBe(false);
  });
});

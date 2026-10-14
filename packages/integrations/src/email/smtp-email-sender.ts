// Sends email over SMTP with nodemailer. Amazon SES is used through its SMTP interface, so this one adapter covers
// SES in the cloud and Mailpit locally.
import { Socket } from "node:net";
import nodemailer from "nodemailer";
import { assertSafeHeaders, type EmailSender } from "./email-sender.js";

export interface SmtpSettings {
  host: string;
  port: number;
  /** TLS from the first byte (port 465). Otherwise STARTTLS is used when the server offers it. */
  secure: boolean;
  user?: string | undefined;
  password?: string | undefined;
  /** Our sending address, e.g. no-reply@mail.<our domain>. */
  fromAddress: string;
  /** The most one send may take in all, in milliseconds. Default 60 seconds; tests shorten it. */
  sendTimeoutMs?: number | undefined;
}

/** socketTimeout is per round trip, so a server that answers slowly could hold a send for much longer than that. */
const SEND_TIMEOUT_MS = 60_000;

/** What a failed send keeps: the codes say what went wrong; the rest of nodemailer's error names the recipients. */
function safeSendError(error: unknown): Error {
  const { code, responseCode } = (typeof error === "object" && error !== null ? error : {}) as {
    code?: unknown;
    responseCode?: unknown;
  };
  const codeText = typeof code === "string" ? code : "unknown";
  const responseText = typeof responseCode === "number" ? ` (SMTP ${String(responseCode)})` : "";
  const safe = new Error(`Sending the email failed: ${codeText}${responseText}`);
  return Object.assign(safe, {
    ...(typeof code === "string" ? { code } : {}),
    ...(typeof responseCode === "number" ? { responseCode } : {}),
  });
}

export function createSmtpEmailSender(settings: SmtpSettings): EmailSender {
  if (settings.user !== undefined && (settings.password === undefined || settings.password === "")) {
    throw new RangeError("The SMTP settings have a user but no password");
  }
  const deadline = settings.sendTimeoutMs ?? SEND_TIMEOUT_MS;

  /**
   * A transport for one send, over a socket we hold. nodemailer's own close() does not end an SMTP connection (the
   * plain transport only emits an event, and the pool closes idle connections only), and a server that trickles
   * bytes keeps resetting its per-round-trip socket timeout. Holding the socket lets the deadline destroy it, which
   * stops the send for good: nothing can be delivered after the timeout has been reported and the job retried.
   */
  const transportFor = (socket: Socket) =>
    nodemailer.createTransport({
      host: settings.host,
      port: settings.port,
      secure: settings.secure,
      socket,
      // Credentials never cross the network in clear text: without TLS from the first byte, STARTTLS is mandatory.
      ...(settings.user !== undefined && !settings.secure ? { requireTLS: true } : {}),
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 30_000,
      ...(settings.user === undefined ? {} : { auth: { user: settings.user, pass: settings.password ?? "" } }),
    });

  /** Runs the send against the overall deadline; on timeout the connection is destroyed and the send is retryable. */
  const withDeadline = async (socket: Socket, send: Promise<unknown>): Promise<void> => {
    let timer: NodeJS.Timeout | undefined;
    const timedOut = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        socket.destroy();
        reject(Object.assign(new Error("The send took too long"), { code: "ESENDTIMEOUT" }));
      }, deadline);
    });
    // Destroying the socket makes the send fail too, after the timeout has already won the race.
    send.catch(() => undefined);
    try {
      await Promise.race([send, timedOut]);
    } finally {
      clearTimeout(timer);
    }
  };

  return {
    send: async (message) => {
      assertSafeHeaders(message);
      const socket = new Socket();
      try {
        await withDeadline(
          socket,
          transportFor(socket).sendMail({
            from: { name: message.fromName, address: settings.fromAddress },
            to: { name: message.to.name ?? "", address: message.to.address },
            ...(message.replyTo === undefined ? {} : { replyTo: message.replyTo }),
            subject: message.subject,
            text: message.text,
            html: message.html,
            headers: { ...message.headers },
          }),
        );
      } catch (error) {
        throw safeSendError(error);
      }
    },
  };
}

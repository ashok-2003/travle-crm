// Sends email over SMTP with nodemailer. Amazon SES is used through its SMTP interface, so this one adapter covers
// SES in the cloud and Mailpit locally.
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
}

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
  const transport = nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    // Credentials never cross the network in clear text: without TLS from the first byte, STARTTLS is mandatory.
    ...(settings.user !== undefined && !settings.secure ? { requireTLS: true } : {}),
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
    ...(settings.user === undefined ? {} : { auth: { user: settings.user, pass: settings.password ?? "" } }),
  });

  return {
    send: async (message) => {
      assertSafeHeaders(message);
      try {
        await transport.sendMail({
          from: { name: message.fromName, address: settings.fromAddress },
          to: { name: message.to.name ?? "", address: message.to.address },
          ...(message.replyTo === undefined ? {} : { replyTo: message.replyTo }),
          subject: message.subject,
          text: message.text,
          html: message.html,
          headers: { ...message.headers },
        });
      } catch (error) {
        throw safeSendError(error);
      }
    },
  };
}

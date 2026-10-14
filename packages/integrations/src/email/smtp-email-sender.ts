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

export function createSmtpEmailSender(settings: SmtpSettings): EmailSender {
  const transport = nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    ...(settings.user === undefined ? {} : { auth: { user: settings.user, pass: settings.password ?? "" } }),
  });

  return {
    send: async (message) => {
      assertSafeHeaders(message);
      await transport.sendMail({
        from: { name: message.fromName, address: settings.fromAddress },
        to: { name: message.to.name ?? "", address: message.to.address },
        ...(message.replyTo === undefined ? {} : { replyTo: message.replyTo }),
        subject: message.subject,
        text: message.text,
        html: message.html,
        headers: { ...message.headers },
      });
    },
  };
}

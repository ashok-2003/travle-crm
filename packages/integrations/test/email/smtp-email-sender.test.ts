// The SMTP adapter delivers what the domain asks for, from our address with the organization's name and Reply-To,
// and refuses header injection. Runs against Mailpit in a container.
import { brand } from "@travel-crm/brand";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSmtpEmailSender, type EmailMessage, type EmailSender } from "../../src/email/index.js";
import { startMailpit, type Mailpit } from "../support/mailpit.js";

/** What the domain passes as the display name: the organization's name, then the product's. */
const fromName = `Sharma Travels via ${brand.emailSenderName}`;

const message: EmailMessage = {
  to: { name: "Asha Owner", address: "asha@agency.example" },
  fromName,
  replyTo: "hello@sharma.example",
  subject: "Your quotation was opened",
  text: "Meera opened Quotation QT-2026-0042.",
  html: "<p>Meera opened <b>Quotation QT-2026-0042</b>.</p>",
  headers: { "List-Unsubscribe": "<https://app.example/settings/notifications>" },
};

describe("SMTP email sender", () => {
  let mailpit: Mailpit;
  let sender: EmailSender;

  beforeAll(async () => {
    mailpit = await startMailpit();
    sender = createSmtpEmailSender({
      host: mailpit.smtpHost,
      port: mailpit.smtpPort,
      secure: false,
      fromAddress: "no-reply@example.test",
    });
  });

  afterAll(async () => {
    await mailpit.stop();
  });

  it("sends from our address under the organization's name, with its Reply-To and both parts", async () => {
    await sender.send(message);

    const [received] = await mailpit.messages();
    expect(received?.From).toEqual({
      Name: fromName,
      Address: "no-reply@example.test",
    });
    expect(received?.To).toEqual([{ Name: "Asha Owner", Address: "asha@agency.example" }]);
    expect(received?.ReplyTo).toEqual([{ Name: "", Address: "hello@sharma.example" }]);
    expect(received?.Subject).toBe("Your quotation was opened");
    expect(received?.Text.trim()).toBe("Meera opened Quotation QT-2026-0042.");
    expect(received?.HTML).toContain("<b>Quotation QT-2026-0042</b>");
    const headers = await mailpit.headers(received?.ID ?? "");
    expect(headers["List-Unsubscribe"]).toEqual(["<https://app.example/settings/notifications>"]);
  });

  it("sends without a Reply-To when the organization has no contact email", async () => {
    await sender.send({ ...message, replyTo: undefined, subject: "No reply-to" });

    const received = (await mailpit.messages()).find((sent) => sent.Subject === "No reply-to");
    expect(received?.ReplyTo).toEqual([]);
  });

  it("refuses a line break in a header value before connecting, so nobody can add headers", async () => {
    await expect(sender.send({ ...message, subject: "Hi\r\nBcc: everyone@example.test" })).rejects.toThrow(
      /line break/,
    );
    await expect(sender.send({ ...message, fromName: "Sharma\nTravels" })).rejects.toThrow(/line break/);
    await expect(
      sender.send({ ...message, headers: { "List-Unsubscribe": "<https://a>\r\nX-Evil: 1" } }),
    ).rejects.toThrow(/line break/);
  });

  it("delivers names with quotes and commas as one recipient and one sender, without extra headers", async () => {
    const tricky = 'Asha "Boss", Owner';
    await sender.send({
      ...message,
      to: { name: tricky, address: "asha@agency.example" },
      fromName: 'Sharma, "Travels"',
      subject: "Tricky names",
    });

    const received = (await mailpit.messages()).find((sent) => sent.Subject === "Tricky names");
    expect(received?.To).toEqual([{ Name: tricky, Address: "asha@agency.example" }]);
    expect(received?.From.Name).toBe('Sharma, "Travels"');
    const headers = await mailpit.headers(received?.ID ?? "");
    expect(Object.keys(headers).map((name) => name.toLowerCase())).not.toContain("bcc");
  });

  it("refuses a Bcc or Reply-To set through the custom headers", async () => {
    await expect(sender.send({ ...message, headers: { Bcc: "everyone@example.test" } })).rejects.toThrow(/header/);
    await expect(sender.send({ ...message, headers: { "reply-to": "evil@example.test" } })).rejects.toThrow(/header/);
  });
});

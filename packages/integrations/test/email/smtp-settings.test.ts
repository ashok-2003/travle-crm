// The SMTP adapter's transport settings and error handling, checked without a server: credentials only travel over TLS,
// connections time out, and a failure never carries the recipients.
import nodemailer from "nodemailer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSmtpEmailSender, type EmailMessage } from "../../src/email/index.js";

const message: EmailMessage = {
  to: { name: "Asha Owner", address: "asha@agency.example" },
  fromName: "Sharma Travels",
  subject: "Hello",
  text: "Hi",
  html: "<p>Hi</p>",
};
const base = { host: "smtp.example.test", port: 587, fromAddress: "no-reply@example.test" };

afterEach(() => {
  vi.restoreAllMocks();
});

function spyOnTransport(sendMail: () => Promise<unknown> = () => Promise.resolve({})) {
  return vi.spyOn(nodemailer, "createTransport").mockReturnValue({ sendMail } as never);
}

describe("SMTP settings", () => {
  it("requires TLS before sending credentials when the connection is not secure from the start", () => {
    const create = spyOnTransport();
    createSmtpEmailSender({ ...base, secure: false, user: "ses-user", password: "secret" });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ requireTLS: true }));
  });

  it("does not demand STARTTLS without credentials (Mailpit) or when TLS is there from the first byte", () => {
    const create = spyOnTransport();
    createSmtpEmailSender({ ...base, secure: false });
    createSmtpEmailSender({ ...base, port: 465, secure: true, user: "ses-user", password: "secret" });
    expect(create.mock.calls[0]?.[0]).not.toHaveProperty("requireTLS", true);
    expect(create.mock.calls[1]?.[0]).not.toHaveProperty("requireTLS", true);
  });

  it("times out connecting, greeting and on the socket", () => {
    const create = spyOnTransport();
    createSmtpEmailSender({ ...base, secure: false });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 30_000 }),
    );
  });

  it("refuses a user without a password", () => {
    spyOnTransport();
    expect(() => createSmtpEmailSender({ ...base, secure: false, user: "ses-user" })).toThrow(/password/);
  });
});

describe("SMTP errors", () => {
  it("keeps the code and response code and drops the recipients and server response", async () => {
    const failure = Object.assign(new Error("Can't send mail to asha@agency.example"), {
      code: "EENVELOPE",
      responseCode: 550,
      response: "550 asha@agency.example: no such user",
      envelope: { from: "no-reply@example.test", to: ["asha@agency.example"] },
      rejected: ["asha@agency.example"],
      command: "RCPT TO",
    });
    spyOnTransport(() => Promise.reject(failure));
    const sender = createSmtpEmailSender({ ...base, secure: false });

    const error: unknown = await sender.send(message).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({ code: "EENVELOPE", responseCode: 550 });
    expect(JSON.stringify(error)).not.toContain("agency.example");
    expect((error as Error).message).not.toContain("agency.example");
    expect((error as Error).cause).toBeUndefined();
    expect(error).not.toHaveProperty("envelope");
    expect(error).not.toHaveProperty("rejected");
    expect(error).not.toHaveProperty("response");
  });
});

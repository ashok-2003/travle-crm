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

function spyOnTransport(sendMail: () => Promise<unknown> = () => Promise.resolve({}), close = vi.fn()) {
  return vi.spyOn(nodemailer, "createTransport").mockReturnValue({ sendMail, close } as never);
}

describe("SMTP settings", () => {
  /** The options a send creates its transport with. */
  async function optionsOf(settings: Parameters<typeof createSmtpEmailSender>[0]) {
    const create = spyOnTransport();
    await createSmtpEmailSender(settings).send(message);
    return create.mock.calls[0]?.[0] as unknown as Record<string, unknown>;
  }

  it("requires TLS before sending credentials when the connection is not secure from the start", async () => {
    const options = await optionsOf({ ...base, secure: false, user: "ses-user", password: "secret" });
    expect(options).toMatchObject({ requireTLS: true });
  });

  it("does not demand STARTTLS without credentials (Mailpit) or when TLS is there from the first byte", async () => {
    expect(await optionsOf({ ...base, secure: false })).not.toHaveProperty("requireTLS", true);
    expect(
      await optionsOf({ ...base, port: 465, secure: true, user: "ses-user", password: "secret" }),
    ).not.toHaveProperty("requireTLS", true);
  });

  it("times out connecting, greeting and on the socket", async () => {
    expect(await optionsOf({ ...base, secure: false })).toMatchObject({
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 30_000,
    });
  });

  it("refuses a user without a password, or with an empty one", () => {
    spyOnTransport();
    expect(() => createSmtpEmailSender({ ...base, secure: false, user: "ses-user" })).toThrow(/password/);
    expect(() => createSmtpEmailSender({ ...base, secure: false, user: "ses-user", password: "" })).toThrow(/password/);
  });

  it("hands nothing to nodemailer when a header name hides a Bcc behind whitespace", async () => {
    const sendMail = vi.fn(() => Promise.resolve({}));
    spyOnTransport(sendMail);
    const sender = createSmtpEmailSender({ ...base, secure: false });
    for (const name of ["Bcc ", " Reply-To", "Reply-To\t"]) {
      await expect(sender.send({ ...message, headers: { [name]: "evil@example.test" } })).rejects.toThrow(/header/);
    }
    expect(sendMail).not.toHaveBeenCalled();
  });
});

describe("SMTP deadline", () => {
  it("allows 60 seconds by default", async () => {
    vi.useFakeTimers();
    try {
      const timeout = vi.spyOn(globalThis, "setTimeout");
      spyOnTransport();
      await createSmtpEmailSender({ ...base, secure: false }).send(message);
      expect(timeout).toHaveBeenCalledWith(expect.any(Function), 60_000);
    } finally {
      vi.useRealTimers();
    }
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

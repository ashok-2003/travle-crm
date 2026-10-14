// The in-memory email sender records what was sent, for the domain's tests.
import { describe, expect, it } from "vitest";
import { createMemoryEmailSender } from "../../src/email/index.js";

describe("memory email sender", () => {
  it("records each message, oldest first", async () => {
    const sender = createMemoryEmailSender();
    const message = { to: { address: "a@example.test" }, fromName: "A", subject: "One", text: "1", html: "<p>1</p>" };
    await sender.send(message);
    await sender.send({ ...message, subject: "Two" });
    expect(sender.sent.map((sent) => sent.subject)).toEqual(["One", "Two"]);
  });

  it("refuses line breaks in header values, as the SMTP sender does", async () => {
    const sender = createMemoryEmailSender();
    await expect(
      sender.send({
        to: { address: "a@example.test" },
        fromName: "A",
        subject: "x\nBcc: b@example.test",
        text: "",
        html: "",
      }),
    ).rejects.toThrow(/line break/);
    expect(sender.sent).toEqual([]);
  });
});

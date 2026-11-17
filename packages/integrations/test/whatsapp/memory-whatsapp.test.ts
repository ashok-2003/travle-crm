// The in-memory MSG91 every domain test and journey leans on: it sends, fails on request, reports and serves files.
import { describe, expect, it } from "vitest";
import { createMemoryWhatsAppProvider, msg91Signer, parseMsg91Event } from "../../src/whatsapp/index.js";

describe("the in-memory WhatsApp provider", () => {
  it("sends from a known number and gives each message its own id", async () => {
    const provider = createMemoryWhatsAppProvider();
    provider.addNumber("918888800000");
    const first = await provider.sendText("918888800000", "+919876543210", "Hello");
    const second = await provider.sendText("918888800000", "+919876543210", "Again");
    expect(first).toMatchObject({ ok: true });
    expect(first.ok && second.ok && first.wamid !== second.wamid).toBe(true);
    expect(provider.sent.map((message) => message.to)).toEqual(["919876543210", "919876543210"]);
    expect(await provider.sendText("910000000000", "919876543210", "x")).toEqual({ ok: false, reason: "bad_number" });
  });

  it("records sent buttons in memory", async () => {
    const provider = createMemoryWhatsAppProvider();
    provider.addNumber("918888800000");
    const buttons = [
      { id: "book:1", title: "Book these seats" },
      { id: "change:1", title: "Change something" },
    ];
    const result = await provider.sendButtons("918888800000", "+919876543210", {
      body: "Goa, 19 Dec",
      buttons,
      footer: "Reply to change",
      replyTo: "wamid.ASKED",
    });
    expect(result.ok).toBe(true);
    expect(provider.sent).toHaveLength(1);
    expect(provider.sent[0]).toMatchObject({
      kind: "buttons",
      to: "919876543210",
      text: "Goa, 19 Dec",
      replyTo: "wamid.ASKED",
      buttons: { buttons, footer: "Reply to change" },
    });
  });

  it("refuses buttons past WhatsApp's limits in memory too, recording nothing", async () => {
    const provider = createMemoryWhatsAppProvider();
    provider.addNumber("918888800000");
    const result = await provider.sendButtons("918888800000", "919876543210", {
      body: "x",
      buttons: [{ id: "a", title: "A".repeat(21) }],
    });
    expect(result).toEqual({ ok: false, reason: "other", providerCode: "invalid_buttons" });
    expect(provider.sent).toHaveLength(0);
  });

  it("fails the next call as asked, then recovers", async () => {
    const provider = createMemoryWhatsAppProvider();
    provider.addNumber("918888800000");
    provider.failNext("window_closed", { metaCode: "131047" });
    expect(await provider.sendText("918888800000", "919876543210", "x")).toEqual({
      ok: false,
      reason: "window_closed",
      metaCode: "131047",
    });
    expect((await provider.sendText("918888800000", "919876543210", "x")).ok).toBe(true);
  });

  it("makes delivery reports the parser reads back", async () => {
    const provider = createMemoryWhatsAppProvider();
    provider.addNumber("918888800000");
    const result = await provider.sendText("918888800000", "919876543210", "Hello");
    if (!result.ok || result.wamid === null) throw new Error("expected a send");
    const signer = msg91Signer({ token: "t".repeat(32), key: "k".repeat(32) });
    const [event] = parseMsg91Event(signer.body([provider.reportFor(result.wamid, "read")]));
    expect(event).toMatchObject({ type: "status", status: "read", wamid: result.wamid });
  });

  it("serves a file, and refuses a missing, oversized or wrongly typed one", async () => {
    const provider = createMemoryWhatsAppProvider();
    provider.addFile("https://media.example/a", { bytes: new Uint8Array(10), contentType: "image/png" });
    const allowed = ["image/png"];
    expect(
      await provider.downloadMedia("https://media.example/a", { maxBytes: 100, allowedTypes: allowed }),
    ).toMatchObject({ ok: true });
    expect(await provider.downloadMedia("https://media.example/a", { maxBytes: 5, allowedTypes: allowed })).toEqual({
      ok: false,
      reason: "too_big",
    });
    expect(
      await provider.downloadMedia("https://media.example/a", { maxBytes: 100, allowedTypes: ["image/jpeg"] }),
    ).toEqual({ ok: false, reason: "bad_type" });
    expect(
      await provider.downloadMedia("https://media.example/none", { maxBytes: 100, allowedTypes: allowed }),
    ).toEqual({ ok: false, reason: "expired" });
  });

  it("refuses a template that is not approved", async () => {
    const provider = createMemoryWhatsAppProvider();
    provider.addNumber("918888800000");
    provider.addTemplate("918888800000", {
      name: "hello",
      language: "en",
      category: "utility",
      body: "Hi {{1}}",
      footer: null,
      status: "pending",
      reason: null,
      providerRef: null,
    });
    expect(
      await provider.sendTemplate("918888800000", "919876543210", {
        name: "hello",
        language: "en",
        parameters: ["Priya"],
      }),
    ).toEqual({ ok: false, reason: "template_not_approved" });
  });
});

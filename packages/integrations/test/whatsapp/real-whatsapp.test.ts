// The real adapter against a scripted fetch: the key only in the header, codes only in failures, a timeout is `unsure` and is
// not tried again, and nothing of a body or the key reaches an error (ADR 0035, 8.1).
import { describe, expect, it } from "vitest";
import { createRealWhatsAppProvider } from "../../src/whatsapp/index.js";

const KEY = "msg91-secret-key-value";
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function provider(answer: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const requests: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    requests.push({ url, init: init ?? {} });
    return answer(url, init ?? {});
  }) as typeof fetch;
  return {
    requests,
    adapter: createRealWhatsAppProvider({ authKey: KEY, fetch: fetchImpl, baseUrl: "https://msg91.test" }),
  };
}

describe("the real WhatsApp provider", () => {
  it("sends text with the key in a header and the number as digits, and reads the message id", async () => {
    const { adapter, requests } = provider(() =>
      json(200, { status: "success", data: { messages: [{ id: "wamid.X1" }] } }),
    );
    expect(await adapter.sendText("+91 88888 00000", "+919876543210", "Hello")).toEqual({
      ok: true,
      wamid: "wamid.X1",
      requestId: null,
    });
    const [request] = requests;
    expect(request?.url).not.toContain(KEY);
    expect((request?.init.headers as Record<string, string>).authkey).toBe(KEY);
    expect(JSON.parse(request?.init.body as string)).toMatchObject({
      integrated_number: "918888800000",
      recipient_number: "919876543210",
      text: "Hello",
    });
  });

  it("maps Meta's codes and statuses to reasons, keeping codes only", async () => {
    const window = provider(() => json(400, { error: { code: 131047, message: "secret words" } }));
    expect(await window.adapter.sendText("918888800000", "919876543210", "x")).toEqual({
      ok: false,
      reason: "window_closed",
      providerCode: "131047",
      metaCode: "131047",
    });
    expect(await provider(() => json(429, {})).adapter.sendText("1", "2", "x")).toMatchObject({
      ok: false,
      reason: "rate_limited",
    });
    // A 5xx may come after MSG91 took the message: "couldn't confirm", never an automatic second send (D7).
    for (const status of [500, 502, 503, 504]) {
      const { adapter, requests } = provider(() => json(status, {}));
      expect(await adapter.sendText("1", "2", "x")).toMatchObject({ ok: false, reason: "unsure" });
      expect(requests).toHaveLength(1);
    }
    expect(
      await provider(() => json(200, { status: "fail", error: { code: 131026 } })).adapter.sendText("1", "2", "x"),
    ).toMatchObject({
      reason: "not_on_whatsapp",
    });
  });

  it("calls a timeout unsure and does not send twice", async () => {
    const { adapter, requests } = provider(() => {
      throw new DOMException("The operation timed out", "TimeoutError");
    });
    expect(await adapter.sendText("918888800000", "919876543210", "x")).toEqual({ ok: false, reason: "unsure" });
    expect(requests).toHaveLength(1);
  });

  it("tries once more only when the request never left", async () => {
    let calls = 0;
    const { adapter } = provider(() => {
      calls += 1;
      throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } });
    });
    expect(await adapter.sendText("918888800000", "919876543210", "x")).toEqual({ ok: false, reason: "provider_down" });
    expect(calls).toBe(2);
  });

  it("never puts the key or a body in a failure", async () => {
    const { adapter } = provider(() => json(500, { message: `key ${KEY} rejected for 919876543210` }));
    expect(JSON.stringify(await adapter.sendText("918888800000", "919876543210", "x"))).not.toMatch(
      /msg91-secret|919876543210/,
    );
  });

  it("lists templates with their status and category", async () => {
    const { adapter } = provider(() =>
      json(200, {
        data: [
          {
            name: "hello",
            language: "en",
            category: "MARKETING",
            status: "APPROVED",
            components: [{ type: "BODY", text: "Hi {{1}}" }],
          },
          { name: "bye", language: "en", status: "REJECTED", rejected_reason: "Variables" },
        ],
      }),
    );
    const result = await adapter.listTemplates("918888800000");
    expect(result.ok && result.templates).toMatchObject([
      { name: "hello", category: "marketing", status: "approved", body: "Hi {{1}}" },
      { name: "bye", category: "utility", status: "rejected", reason: "Variables" },
    ]);
  });

  it("does not offer a template with a header or buttons, which a body-only send cannot fill", async () => {
    const { adapter } = provider(() =>
      json(200, {
        data: [
          { name: "plain", language: "en", status: "APPROVED", components: [{ type: "BODY", text: "Hi" }] },
          {
            name: "with_image",
            language: "en",
            status: "APPROVED",
            components: [
              { type: "HEADER", format: "IMAGE" },
              { type: "BODY", text: "Hi" },
            ],
          },
          {
            name: "with_link",
            language: "en",
            status: "APPROVED",
            components: [
              { type: "BODY", text: "Hi" },
              { type: "BUTTONS", buttons: [] },
            ],
          },
        ],
      }),
    );
    const result = await adapter.listTemplates("918888800000");
    expect(result.ok && result.templates.map((template) => template.name)).toEqual(["plain"]);
  });

  it("downloads a file within its limits and says why when it cannot", async () => {
    const limits = { maxBytes: 10, allowedTypes: ["image/png"] };
    const ok = provider(() => new Response(new Uint8Array(4), { headers: { "content-type": "image/png" } }));
    expect(await ok.adapter.downloadMedia("https://media.example/a", limits)).toMatchObject({
      ok: true,
      contentType: "image/png",
    });
    // The key goes only to MSG91's own hosts.
    expect((ok.requests[0]?.init.headers as Record<string, string>).authkey).toBeUndefined();
    expect(
      await provider(() => new Response("", { status: 404 })).adapter.downloadMedia("https://media.example/a", limits),
    ).toEqual({ ok: false, reason: "expired" });
    expect(
      await provider(
        () => new Response(new Uint8Array(40), { headers: { "content-type": "image/png" } }),
      ).adapter.downloadMedia("https://media.example/a", limits),
    ).toEqual({ ok: false, reason: "too_big" });
    expect(
      await provider(() => new Response("x", { headers: { "content-type": "text/html" } })).adapter.downloadMedia(
        "https://media.example/a",
        limits,
      ),
    ).toEqual({ ok: false, reason: "bad_type" });
    expect(await ok.adapter.downloadMedia("http://insecure.example/a", limits)).toEqual({
      ok: false,
      reason: "unavailable",
    });
  });

  describe("the key on a media download", () => {
    const limits = { maxBytes: 100, allowedTypes: ["image/png"] };
    const png = () => new Response(new Uint8Array(4), { headers: { "content-type": "image/png" } });
    const keyOf = (request: { init: RequestInit } | undefined) =>
      (request?.init.headers as Record<string, string> | undefined)?.authkey;

    it("goes to MSG91's own hosts, over https, and to no other", async () => {
      for (const url of ["https://control.msg91.com/media/a.png", "https://api.msg91.com/media/a.png"]) {
        const { adapter, requests } = provider(png);
        expect(await adapter.downloadMedia(url, limits)).toMatchObject({ ok: true });
        expect(keyOf(requests[0])).toBe(KEY);
      }
      for (const url of [
        "https://evilmsg91.com/a.png",
        "https://msg91.com.evil.io/a.png",
        "https://control.msg91.com.evil.test/a.png",
        "https://control.msg91.com@evil.test/a.png",
        "https://evil.test/control.msg91.com/a.png",
        "https://msg91.test.evil.test/a.png",
      ]) {
        const { adapter, requests } = provider(png);
        await adapter.downloadMedia(url, limits);
        expect(keyOf(requests[0]), url).toBeUndefined();
      }
    });

    it("never goes over plain http, to a private address, or with a key to a look-alike", async () => {
      for (const url of [
        "http://control.msg91.com/a.png",
        "https://127.0.0.1/a.png",
        "https://localhost/a.png",
        "https://169.254.169.254/latest",
        "https://[::1]/a.png",
        "https://db.internal/a.png",
      ]) {
        const { adapter, requests } = provider(png);
        expect(await adapter.downloadMedia(url, limits), url).toEqual({ ok: false, reason: "unavailable" });
        expect(requests, url).toHaveLength(0);
      }
    });

    it("does not follow a redirect with the key: a foreign target is fetched without it, and plain http is refused", async () => {
      const hops: { url: string; key: string | undefined }[] = [];
      const fetchImpl = ((url: string, init?: RequestInit) => {
        hops.push({ url, key: (init?.headers as Record<string, string>).authkey });
        if (url === "https://control.msg91.com/m")
          return new Response(null, { status: 302, headers: { location: "https://cdn.example/m.png" } });
        if (url === "https://cdn.example/m.png") return png();
        return new Response(null, { status: 302, headers: { location: "http://plain.example/m.png" } });
      }) as unknown as typeof fetch;
      const adapter = createRealWhatsAppProvider({ authKey: KEY, fetch: fetchImpl, baseUrl: "https://msg91.test" });
      expect(await adapter.downloadMedia("https://control.msg91.com/m", limits)).toMatchObject({ ok: true });
      expect(hops).toEqual([
        { url: "https://control.msg91.com/m", key: KEY },
        { url: "https://cdn.example/m.png", key: undefined },
      ]);
      hops.length = 0;
      expect(await adapter.downloadMedia("https://control.msg91.com/other", limits)).toEqual({
        ok: false,
        reason: "unavailable",
      });
      expect(hops.map((hop) => hop.url)).toEqual(["https://control.msg91.com/other"]);
    });

    it("stops after a few redirects, and reads no more than the limit when no length was declared", async () => {
      const loop = (() =>
        new Response(null, {
          status: 302,
          headers: { location: "https://cdn.example/again" },
        })) as unknown as typeof fetch;
      const looping = createRealWhatsAppProvider({ authKey: KEY, fetch: loop, baseUrl: "https://msg91.test" });
      expect(await looping.downloadMedia("https://cdn.example/a", limits)).toEqual({
        ok: false,
        reason: "unavailable",
      });
      let pulled = 0;
      const endless = new ReadableStream<Uint8Array>({
        pull(controller) {
          pulled += 10;
          controller.enqueue(new Uint8Array(10));
        },
      });
      const { adapter } = provider(() => new Response(endless, { headers: { "content-type": "image/png" } }));
      expect(await adapter.downloadMedia("https://cdn.example/big", limits)).toEqual({ ok: false, reason: "too_big" });
      expect(pulled).toBeLessThan(1000);
    });

    it("sends the key to the development server's own origin only when one is configured", async () => {
      const { adapter, requests } = provider(png);
      await adapter.downloadMedia("https://msg91.test/media/a.png", limits);
      expect(keyOf(requests[0])).toBe(KEY);
      await adapter.downloadMedia("https://msg91.test.evil.test/a.png", limits);
      expect(keyOf(requests[1])).toBeUndefined();
    });
  });
});

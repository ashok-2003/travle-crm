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
    expect(await provider(() => json(503, {})).adapter.sendText("1", "2", "x")).toMatchObject({
      ok: false,
      reason: "provider_down",
    });
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
});

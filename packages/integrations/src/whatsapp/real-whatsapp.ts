// The real WhatsAppProvider: plain fetch to control.msg91.com (ADR 0035). Every request has a timeout and carries the account's
// key in an `authkey` header, never the URL. A timeout after the request left is `unsure` and never retried; only a request
// that provably never left (a connect error) is tried once more. MSG91's errors become our reasons carrying codes only.
// SPIKE(S4, S5, S7, S8): paths and bodies follow MSG91's public pages and a third-party mirror until a real account confirms.
import {
  bodyReportsFailure,
  mapSendFailure,
  parseNumberInfo,
  parseTemplates,
  sendSucceeded,
} from "./msg91-responses.js";
import {
  failed,
  type WhatsAppCreateResult,
  type WhatsAppFailureReason,
  type WhatsAppListResult,
  type WhatsAppMediaResult,
  type WhatsAppMediaToSend,
  type WhatsAppNumberResult,
  type WhatsAppProvider,
  type WhatsAppSendResult,
  type WhatsAppTemplateDraft,
  type WhatsAppTemplateSend,
} from "./whatsapp-provider.js";

export interface RealWhatsAppProviderOptions {
  authKey: string;
  /** Default https://control.msg91.com; the journeys point it at their fake (development and tests only). */
  baseUrl?: string;
  fetch?: typeof fetch;
  /** 10 seconds. */
  timeoutMs?: number;
  /** 30 seconds. */
  mediaTimeoutMs?: number;
}

type Outcome = { kind: "answered"; status: number; body: unknown } | { kind: "never_left" } | { kind: "timed_out" };

/** The hosts that may carry the account's key. SPIKE(S7): MSG91's media host is not confirmed. */
const MSG91_KEY_HOSTS: readonly string[] = ["control.msg91.com", "api.msg91.com"];
const MAX_REDIRECTS = 3;

/** An address literal or an internal name: never fetched, since the link comes from outside. */
function isPrivateHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return (
    host.includes(":") ||
    /^\d+(\.\d+){3}$/.test(host) ||
    host === "localhost" ||
    !host.includes(".") ||
    [".local", ".internal", ".localhost", ".lan", ".home.arpa"].some((suffix) => host.endsWith(suffix))
  );
}

/** Whether a link may be fetched at all: https to a public name, or the development server's own origin. */
const mayFetch = (url: URL, devOrigin: string | null): boolean =>
  url.origin === devOrigin || (url.protocol === "https:" && url.username === "" && !isPrivateHost(url.hostname));

/** Whether the key may be sent to this URL: an exact MSG91 host over https, or the development server's origin. */
const mayCarryKey = (url: URL, devOrigin: string | null): boolean =>
  url.origin === devOrigin || (url.protocol === "https:" && MSG91_KEY_HOSTS.includes(url.hostname));

/** The body, read as it arrives and given up on once it is over `maxBytes`. */
async function readAtMost(response: Response, maxBytes: number): Promise<Uint8Array | null> {
  const reader: ReadableStreamDefaultReader<Uint8Array> | undefined = response.body?.getReader();
  if (reader === undefined) return new Uint8Array(0);
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

const digits = (value: string) => value.replace(/\D/g, "");

function isConnectError(error: unknown): boolean {
  const code = (error as { cause?: { code?: unknown } } | null)?.cause?.code;
  return typeof code === "string" && ["ENOTFOUND", "ECONNREFUSED", "EAI_AGAIN"].includes(code);
}

export function createRealWhatsAppProvider(options: RealWhatsAppProviderOptions): WhatsAppProvider {
  const { authKey } = options;
  const baseUrl = (options.baseUrl ?? "https://control.msg91.com").replace(/\/$/, "");
  const fetchImpl = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const mediaTimeoutMs = options.mediaTimeoutMs ?? 30_000;
  // The development server's own origin (the journeys' fake), the one non-MSG91 origin the key and plain http may go to.
  const devOrigin = options.baseUrl === undefined ? null : (URL.parse(baseUrl)?.origin ?? null);

  async function call(method: "GET" | "POST", path: string, body?: object): Promise<Outcome> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await fetchImpl(`${baseUrl}${path}`, {
          method,
          headers: {
            authkey: authKey,
            accept: "application/json",
            ...(body === undefined ? {} : { "content-type": "application/json" }),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          signal: AbortSignal.timeout(timeoutMs),
        });
        const parsed: unknown = await response.json().catch(() => null);
        return { kind: "answered", status: response.status, body: parsed };
      } catch (error) {
        if (isConnectError(error) && attempt === 0) continue;
        return isConnectError(error) ? { kind: "never_left" } : { kind: "timed_out" };
      }
    }
    return { kind: "never_left" };
  }

  const reasonOfOutcome = (outcome: Exclude<Outcome, { kind: "answered" }>): WhatsAppFailureReason =>
    outcome.kind === "never_left" ? "provider_down" : "unsure";

  async function send(payload: object): Promise<WhatsAppSendResult> {
    const outcome = await call("POST", "/api/v5/whatsapp/whatsapp-outbound-message/", payload);
    if (outcome.kind !== "answered") return failed(reasonOfOutcome(outcome));
    if (outcome.status >= 200 && outcome.status < 300 && !bodyReportsFailure(outcome.body)) {
      return sendSucceeded(outcome.body);
    }
    return mapSendFailure(outcome.status >= 400 ? outcome.status : 400, outcome.body);
  }

  const base = (number: string, to: string) => ({ integrated_number: digits(number), recipient_number: digits(to) });

  return {
    sendText: (number, to, textBody) => send({ ...base(number, to), content_type: "text", text: textBody }),
    // MSG91 takes a file as `attachment_url` (its own document for the session send, checked 2026-10-26: image and video
    // with `attachment_url` and `caption`); a document also names its file. A short-lived link MSG91 fetches the file from.
    sendMedia: (number, to, media: WhatsAppMediaToSend) =>
      send({
        ...base(number, to),
        content_type: media.kind,
        attachment_url: media.url,
        ...(media.caption === undefined ? {} : { caption: media.caption }),
        ...(media.fileName === undefined ? {} : { filename: media.fileName }),
        // SPIKE(S4): Meta's `voice` flag for Ogg Opus audio; the name MSG91 gives it is not confirmed.
        ...(media.voice === true ? { voice: true } : {}),
      }),
    sendTemplate: async (number, to, template: WhatsAppTemplateSend) => {
      const components = Object.fromEntries(
        template.parameters.map((value, index) => [`body_${String(index + 1)}`, { type: "text", value }]),
      );
      const outcome = await call("POST", "/api/v5/whatsapp/whatsapp-outbound-message/bulk/", {
        integrated_number: digits(number),
        content_type: "template",
        payload: {
          messaging_product: "whatsapp",
          type: "template",
          template: {
            name: template.name,
            language: { code: template.language, policy: "deterministic" },
            to_and_components: [{ to: [digits(to)], components }],
          },
        },
      });
      if (outcome.kind !== "answered") return failed(reasonOfOutcome(outcome));
      if (outcome.status >= 200 && outcome.status < 300 && !bodyReportsFailure(outcome.body))
        return sendSucceeded(outcome.body);
      return mapSendFailure(outcome.status >= 400 ? outcome.status : 400, outcome.body);
    },
    listTemplates: async (number): Promise<WhatsAppListResult> => {
      const outcome = await call("GET", `/api/v5/whatsapp/get-template-client/${digits(number)}`);
      if (outcome.kind !== "answered") return { ok: false, reason: reasonOfOutcome(outcome) };
      if (outcome.status < 200 || outcome.status >= 300)
        return { ok: false, reason: outcome.status >= 500 ? "provider_down" : "other" };
      return { ok: true, templates: parseTemplates(outcome.body) };
    },
    createTemplate: async (number, template: WhatsAppTemplateDraft): Promise<WhatsAppCreateResult> => {
      const outcome = await call("POST", "/api/v5/whatsapp/client-panel-template/", {
        integrated_number: digits(number),
        template_name: template.name,
        language: template.language,
        category: template.category.toUpperCase(),
        components: [
          { type: "BODY", text: template.body, example: { body_text: [template.samples] } },
          ...(template.footer === null ? [] : [{ type: "FOOTER", text: template.footer }]),
        ],
      });
      if (outcome.kind !== "answered") return failed(reasonOfOutcome(outcome));
      if (outcome.status < 200 || outcome.status >= 300 || bodyReportsFailure(outcome.body)) {
        const failure = mapSendFailure(outcome.status, outcome.body);
        return failure.ok ? failed("other") : failure;
      }
      const record =
        typeof outcome.body === "object" && outcome.body !== null ? (outcome.body as Record<string, unknown>) : {};
      const data =
        typeof record.data === "object" && record.data !== null ? (record.data as Record<string, unknown>) : record;
      const ref = data.id ?? data.template_id;
      return { ok: true, providerRef: typeof ref === "string" || typeof ref === "number" ? String(ref) : null };
    },
    fetchNumber: async (number): Promise<WhatsAppNumberResult> => {
      const outcome = await call("GET", `/api/v5/whatsapp/whatsapp-activation/?integrated_number=${digits(number)}`);
      if (outcome.kind !== "answered") return { ok: false, reason: reasonOfOutcome(outcome) };
      const info = outcome.status >= 200 && outcome.status < 300 ? parseNumberInfo(outcome.body) : null;
      return info === null
        ? { ok: false, reason: outcome.status >= 500 ? "provider_down" : "other" }
        : { ok: true, info };
    },
    downloadMedia: async (url, limits): Promise<WhatsAppMediaResult> => {
      // A customer's media link is a URL from a payload: it is fetched over https only, never from a private address, and the
      // account's key goes only to MSG91's own hosts (an exact list), at every hop of a redirect, which is followed by hand.
      // SPIKE(S7): the hosts MSG91's media lives on, and whether it needs the key at all.
      let target = URL.parse(url);
      try {
        for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
          if (target === null || !mayFetch(target, devOrigin)) return { ok: false, reason: "unavailable" };
          const response = await fetchImpl(target.href, {
            method: "GET",
            headers: mayCarryKey(target, devOrigin) ? { authkey: authKey } : {},
            redirect: "manual",
            signal: AbortSignal.timeout(mediaTimeoutMs),
          });
          if (response.status >= 300 && response.status < 400) {
            const next = response.headers.get("location");
            target = next === null ? null : URL.parse(next, target.href);
            continue;
          }
          if (response.status === 404 || response.status === 410) return { ok: false, reason: "expired" };
          if (!response.ok) return { ok: false, reason: "unavailable" };
          const contentType = (response.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
          if (!limits.allowedTypes.includes(contentType)) return { ok: false, reason: "bad_type" };
          const declared = Number(response.headers.get("content-length"));
          if (Number.isFinite(declared) && declared > limits.maxBytes) return { ok: false, reason: "too_big" };
          const bytes = await readAtMost(response, limits.maxBytes);
          return bytes === null ? { ok: false, reason: "too_big" } : { ok: true, bytes, contentType };
        }
        return { ok: false, reason: "unavailable" };
      } catch {
        return { ok: false, reason: "unavailable" };
      }
    },
  };
}

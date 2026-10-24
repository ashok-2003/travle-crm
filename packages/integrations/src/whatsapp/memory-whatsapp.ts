// An in-memory WhatsAppProvider for the domain's, the api's and the journeys' tests (ADR 0035): a scripted MSG91 that holds
// numbers, templates, files and the messages sent, a settable clock, a switch for each failure kind, and the delivery
// reports MSG91 would send for what was sent (you advance them yourself).
import {
  failed,
  type WhatsAppCreateResult,
  type WhatsAppFailureReason,
  type WhatsAppListResult,
  type WhatsAppMediaResult,
  type WhatsAppMediaToSend,
  type WhatsAppNumberInfo,
  type WhatsAppNumberResult,
  type WhatsAppProvider,
  type WhatsAppSendResult,
  type WhatsAppTemplateDraft,
  type WhatsAppTemplateSend,
  type WhatsAppTemplateStatus,
  type WhatsAppTemplateSummary,
} from "./whatsapp-provider.js";
import { statusBody } from "./signer.js";

export interface SentMessage {
  wamid: string;
  number: string;
  to: string;
  kind: "text" | "media" | "template";
  text?: string;
  media?: WhatsAppMediaToSend;
  template?: WhatsAppTemplateSend;
  sentAt: Date;
}

export interface MemoryWhatsAppProvider extends WhatsAppProvider {
  /** Numbers the account holds; a send from any other fails bad_number. */
  addNumber(number: string, info?: Partial<WhatsAppNumberInfo>): void;
  addTemplate(number: string, template: WhatsAppTemplateSummary): void;
  setTemplateStatus(number: string, name: string, status: WhatsAppTemplateStatus, reason?: string): void;
  /** A file at a URL, as an inbound message's media. */
  addFile(url: string, file: { bytes: Uint8Array; contentType: string }): void;
  /** Makes the next `times` calls (default 1) fail with this reason. */
  failNext(reason: WhatsAppFailureReason, options?: { times?: number; providerCode?: string; metaCode?: string }): void;
  /** Makes every send fail with this reason until cleared with null. */
  failAll(reason: WhatsAppFailureReason | null): void;
  /** The next call throws this error as it is: a failure whose message carries the key (ADR 0035, 8.1). */
  throwNext(error: Error): void;
  setNow(now: Date): void;
  advance(milliseconds: number): void;
  readonly sent: readonly SentMessage[];
  /** The body MSG91 would POST to the webhook for a sent message reaching this status. */
  reportFor(
    wamid: string,
    eventName: "sent" | "delivered" | "read" | "failed",
    reason?: string,
  ): Record<string, string | number>;
  readonly calls: { total: number; byMethod: Readonly<Record<string, number>> };
}

export function createMemoryWhatsAppProvider(options: { now?: Date } = {}): MemoryWhatsAppProvider {
  let now = options.now ?? new Date("2026-10-23T10:00:00Z");
  const numbers = new Map<string, WhatsAppNumberInfo>();
  const templates = new Map<string, WhatsAppTemplateSummary[]>();
  const files = new Map<string, { bytes: Uint8Array; contentType: string }>();
  const sent: SentMessage[] = [];
  const failures: { reason: WhatsAppFailureReason; providerCode?: string; metaCode?: string; times: number }[] = [];
  let failEvery: WhatsAppFailureReason | null = null;
  let thrown: Error | null = null;
  let counter = 0;
  const byMethod: Record<string, number> = {};
  const calls = { total: 0, byMethod };

  const digits = (value: string) => value.replace(/\D/g, "");
  const enter = (method: string) => {
    calls.total += 1;
    byMethod[method] = (byMethod[method] ?? 0) + 1;
    if (thrown !== null) {
      const error = thrown;
      thrown = null;
      throw error;
    }
  };
  const scriptedFailure = () => {
    const next = failures[0];
    if (next === undefined) return null;
    next.times -= 1;
    if (next.times <= 0) failures.shift();
    return failed(next.reason, {
      ...(next.providerCode === undefined ? {} : { providerCode: next.providerCode }),
      ...(next.metaCode === undefined ? {} : { metaCode: next.metaCode }),
    });
  };

  function send(
    method: string,
    number: string,
    to: string,
    message: Omit<SentMessage, "wamid" | "number" | "to" | "sentAt">,
  ): WhatsAppSendResult {
    enter(method);
    const scripted = scriptedFailure();
    if (scripted !== null) return scripted;
    if (failEvery !== null) return failed(failEvery);
    if (!numbers.has(digits(number))) return failed("bad_number");
    counter += 1;
    const wamid = `wamid.memory-${String(counter).padStart(6, "0")}`;
    sent.push({ ...message, wamid, number: digits(number), to: digits(to), sentAt: now });
    return { ok: true, wamid, requestId: `req-${String(counter)}` };
  }

  return {
    addNumber: (number, info = {}) =>
      numbers.set(digits(number), { qualityRating: "green", status: "connected", ...info }),
    addTemplate: (number, template) =>
      templates.set(digits(number), [...(templates.get(digits(number)) ?? []), template]),
    setTemplateStatus: (number, name, status, reason) => {
      for (const template of templates.get(digits(number)) ?? []) {
        if (template.name === name) Object.assign(template, { status, reason: reason ?? null });
      }
    },
    addFile: (url, file) => files.set(url, file),
    failNext: (reason, opts = {}) =>
      failures.push({
        reason,
        times: opts.times ?? 1,
        ...(opts.providerCode === undefined ? {} : { providerCode: opts.providerCode }),
        ...(opts.metaCode === undefined ? {} : { metaCode: opts.metaCode }),
      }),
    failAll: (reason) => (failEvery = reason),
    throwNext: (error) => (thrown = error),
    setNow: (value) => (now = value),
    advance: (milliseconds) => (now = new Date(now.getTime() + milliseconds)),
    sent,
    calls,
    reportFor: (wamid, eventName, reason) => {
      const message = sent.find((candidate) => candidate.wamid === wamid);
      return statusBody({
        integratedNumber: message?.number ?? "",
        customerNumber: message?.to ?? "",
        wamid,
        eventName,
        ...(reason === undefined ? {} : { reason }),
        ts: Math.floor(now.getTime() / 1000),
      });
    },
    sendText: (number, to, text) => Promise.resolve().then(() => send("sendText", number, to, { kind: "text", text })),
    sendMedia: (number, to, media) =>
      Promise.resolve().then(() => send("sendMedia", number, to, { kind: "media", media })),
    sendTemplate: (number, to, template) =>
      Promise.resolve().then(() => {
        const approved = (templates.get(digits(number)) ?? []).find(
          (candidate) => candidate.name === template.name && candidate.language === template.language,
        );
        if (approved !== undefined && approved.status !== "approved") {
          enter("sendTemplate");
          return failed("template_not_approved");
        }
        return send("sendTemplate", number, to, { kind: "template", template });
      }),
    listTemplates: (number): Promise<WhatsAppListResult> =>
      Promise.resolve().then(() => {
        enter("listTemplates");
        const scripted = scriptedFailure();
        if (scripted !== null) return { ok: false, reason: scripted.reason };
        return { ok: true, templates: (templates.get(digits(number)) ?? []).map((template) => ({ ...template })) };
      }),
    createTemplate: (number, draft: WhatsAppTemplateDraft): Promise<WhatsAppCreateResult> =>
      Promise.resolve().then(() => {
        enter("createTemplate");
        const scripted = scriptedFailure();
        if (scripted !== null) return scripted;
        const list = templates.get(digits(number)) ?? [];
        counter += 1;
        list.push({ ...draft, status: "pending", reason: null, providerRef: `tpl-${String(counter)}` });
        templates.set(digits(number), list);
        return { ok: true, providerRef: `tpl-${String(counter)}` };
      }),
    fetchNumber: (number): Promise<WhatsAppNumberResult> =>
      Promise.resolve().then(() => {
        enter("fetchNumber");
        const scripted = scriptedFailure();
        if (scripted !== null) return { ok: false, reason: scripted.reason };
        const info = numbers.get(digits(number));
        return info === undefined ? { ok: false, reason: "bad_number" } : { ok: true, info: { ...info } };
      }),
    downloadMedia: (url, opts): Promise<WhatsAppMediaResult> =>
      Promise.resolve().then(() => {
        enter("downloadMedia");
        const file = files.get(url);
        if (file === undefined) return { ok: false, reason: "expired" };
        if (file.bytes.byteLength > opts.maxBytes) return { ok: false, reason: "too_big" };
        if (!opts.allowedTypes.includes(file.contentType)) return { ok: false, reason: "bad_type" };
        return { ok: true, bytes: file.bytes, contentType: file.contentType };
      }),
  };
}

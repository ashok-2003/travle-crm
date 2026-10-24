// What MSG91 answers, read defensively with small typed guards (not Zod: the integrations package stays outside the api's
// bundle, ADR 0027): its bodies as our port's values, and its errors as our reasons. A failure is built from codes only,
// never the body, the URL or the key (ADR 0035, 8.1).
// SPIKE(S4, S5, S6, S8): the field names and the code table rest on MSG91's and Meta's public documents until a real account
// shows them.
import {
  failed,
  type WhatsAppFailureReason,
  type WhatsAppSendResult,
  type WhatsAppTemplateStatus,
  type WhatsAppTemplateSummary,
} from "./whatsapp-provider.js";

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const text = (value: unknown): string | null =>
  typeof value === "string" && value !== "" ? value : typeof value === "number" ? String(value) : null;

/** Meta's error codes as our reasons (Cloud API error codes, which MSG91 passes through). */
const reasonByMetaCode: Readonly<Record<string, WhatsAppFailureReason>> = {
  "131047": "window_closed",
  "131051": "other",
  "131026": "not_on_whatsapp",
  "131021": "bad_number",
  "130429": "rate_limited",
  "131056": "rate_limited",
  "131048": "tier_limit",
  "131049": "tier_limit",
  "132001": "template_not_approved",
  "132015": "template_not_approved",
  "132016": "template_not_approved",
};

/** The numeric code in an error body, wherever MSG91 puts it (`error.code`, `errors[0].code`, `code`). */
export function codeOf(body: unknown): string | null {
  if (!isRecord(body)) return null;
  const error = isRecord(body.error)
    ? body.error
    : Array.isArray(body.errors) && isRecord(body.errors[0])
      ? body.errors[0]
      : body;
  return text(error.code) ?? text(error.error_code) ?? text(error.errorCode);
}

/** A send's failure from the HTTP status and body: only codes are kept. */
export function mapSendFailure(status: number, body: unknown): WhatsAppSendResult {
  const code = codeOf(body);
  const byCode = code === null ? undefined : reasonByMetaCode[code];
  const codes = code === null ? {} : { providerCode: code, ...(byCode === undefined ? {} : { metaCode: code }) };
  if (byCode !== undefined) return failed(byCode, codes);
  if (status === 429) return failed("rate_limited", codes);
  // A 5xx may come after MSG91 took the message (a gateway timeout): "couldn't confirm", never sent again by itself (D7).
  if (status >= 500) return failed("unsure", codes);
  if (status === 400 || status === 422) return failed("bad_number", codes);
  return failed("other", codes);
}

/** The message id of a send's success body: MSG91 may return it as `uuid`, `message_id` or inside Meta's `messages`. */
export function sendSucceeded(body: unknown): WhatsAppSendResult {
  const record = isRecord(body) ? body : {};
  const data = isRecord(record.data) ? record.data : record;
  const messages = Array.isArray(data.messages) ? data.messages : [];
  const first = isRecord(messages[0]) ? messages[0] : {};
  const wamid = text(first.id) ?? text(data.uuid) ?? text(data.message_id) ?? text(data.wamid) ?? null;
  const requestId = text(data.request_id) ?? text(data.requestId) ?? text(record.request_id) ?? null;
  return { ok: true, wamid, requestId };
}

/** Whether a body that came with a success status says it failed (MSG91 sometimes answers 200 with an error). */
export function bodyReportsFailure(body: unknown): boolean {
  if (!isRecord(body)) return false;
  const status = text(body.status)?.toLowerCase();
  return status === "fail" || status === "failed" || status === "error" || body.hasError === true;
}

const templateStatuses: Readonly<Record<string, WhatsAppTemplateStatus>> = {
  approved: "approved",
  pending: "pending",
  in_review: "pending",
  rejected: "rejected",
  paused: "paused",
  disabled: "disabled",
};

/** The templates in a list answer: `data` (or the body) is a list of MSG91's template records. */
export function parseTemplates(body: unknown): WhatsAppTemplateSummary[] {
  const record = isRecord(body) ? body : {};
  const list = Array.isArray(body) ? body : Array.isArray(record.data) ? record.data : [];
  const summaries: WhatsAppTemplateSummary[] = [];
  for (const item of list) {
    if (!isRecord(item)) continue;
    const name = text(item.name) ?? text(item.template_name);
    const language = text(item.language) ?? text(item.language_code);
    const category = text(item.category)?.toLowerCase();
    if (name === null || language === null) continue;
    const components = Array.isArray(item.components) ? item.components.filter(isRecord) : [];
    // A header or buttons need values the send does not give (an image, a link's end): such a template cannot be sent from
    // here, so it is not offered. SPIKE(S5).
    if (
      components.some((component) =>
        ["header", "buttons", "button"].includes(text(component.type)?.toLowerCase() ?? ""),
      )
    ) {
      continue;
    }
    const bodyComponent = components.find((component) => text(component.type)?.toLowerCase() === "body");
    const footerComponent = components.find((component) => text(component.type)?.toLowerCase() === "footer");
    summaries.push({
      name,
      language,
      category: category === "marketing" ? "marketing" : category === "authentication" ? "authentication" : "utility",
      body: text(bodyComponent?.text) ?? text(item.body) ?? "",
      footer: text(footerComponent?.text) ?? text(item.footer),
      status: templateStatuses[(text(item.status) ?? "pending").toLowerCase()] ?? "pending",
      reason: text(item.rejected_reason) ?? text(item.reason),
      providerRef: text(item.id) ?? text(item.template_id),
    });
  }
  return summaries;
}

/** A number's quality and status from the activation answer. */
export function parseNumberInfo(body: unknown): { qualityRating: string | null; status: string | null } | null {
  const record = isRecord(body) ? body : null;
  if (record === null) return null;
  const data: unknown = Array.isArray(record.data) ? (record.data[0] as unknown) : record.data;
  const source = isRecord(data) ? data : record;
  return {
    qualityRating: text(source.quality_rating) ?? text(source.qualityRating) ?? text(source.quality),
    status: text(source.status) ?? text(source.number_status),
  };
}

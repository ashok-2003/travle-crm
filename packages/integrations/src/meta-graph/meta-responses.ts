// What the Graph API answers, read defensively with small typed guards (not Zod: every dependency of the integrations
// package stays outside the api's bundle, ADR 0027): its bodies as our port's values, and its errors as our reasons.
// An error is built from Meta's `code`, `error_subcode` and `type` only, never its message or the URL (M2).
import {
  MetaGraphError,
  type MetaFormDescription,
  type MetaFormQuestion,
  type MetaFormSummary,
  type MetaLead,
  type MetaLeadPlatform,
  type MetaPage,
  type MetaPageGrant,
  type MetaQuestionType,
  type MetaTokenInspection,
} from "./meta-graph.js";

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const text = (value: unknown, fallback = ""): string => (typeof value === "string" ? value : fallback);
const idText = (value: unknown): string | null =>
  typeof value === "string" && value !== "" ? value : typeof value === "number" ? String(value) : null;

function unreadable(): never {
  throw new MetaGraphError("unavailable");
}

/** Meta's code and subcode as our reason (spec M3, M8, M17). */
export function mapMetaError(status: number, body: unknown): MetaGraphError {
  const error = isRecord(body) && isRecord(body.error) ? body.error : null;
  const code = typeof error?.code === "number" ? error.code : undefined;
  const subcode = typeof error?.error_subcode === "number" ? error.error_subcode : undefined;
  const type = typeof error?.type === "string" ? error.type.slice(0, 60) : undefined;
  const details = {
    ...(code === undefined ? {} : { code }),
    ...(subcode === undefined ? {} : { subcode }),
    ...(type === undefined ? {} : { type }),
  };
  // A login code that is bad, used or expired (100 with subcode 36007 or 36009): a login that failed, not a missing object.
  if (code === 100 && (subcode === 36007 || subcode === 36009)) return new MetaGraphError("token_invalid", details);
  // An expired, revoked or invalidated token: 190 and its subcodes; 102 is a session that ended.
  if (code === 190 || code === 102) return new MetaGraphError("token_invalid", details);
  // The call limits: app (4), user (17, 32), Page (32), generic (613), and the lead gen limit (80005, SPIKE: the family).
  if (
    code === 4 ||
    code === 17 ||
    code === 32 ||
    code === 613 ||
    (code !== undefined && code >= 80000 && code <= 80014)
  ) {
    return new MetaGraphError("rate_limited", details);
  }
  if (status === 429) return new MetaGraphError("rate_limited", details);
  // A permission the token lacks: 10 and 200-299.
  if (code === 10 || (code !== undefined && code >= 200 && code <= 299))
    return new MetaGraphError("permission", details);
  if (status === 403 || status === 401) return new MetaGraphError("permission", details);
  // An id that is not there or not ours: 100, with subcode 33 for a missing object.
  if (code === 100 || status === 404) return new MetaGraphError("not_found", details);
  return new MetaGraphError("unavailable", details);
}

/** The next page's cursor: the `after` of the paging, only when Meta says there is a next page. */
export function nextCursor(body: unknown): string | null {
  if (!isRecord(body) || !isRecord(body.paging) || body.paging.next === undefined) return null;
  const cursors = body.paging.cursors;
  return isRecord(cursors) ? idText(cursors.after) : null;
}

const items = (body: unknown): unknown[] =>
  isRecord(body) && Array.isArray(body.data) ? (body.data as unknown[]) : unreadable();

export function parseAccessToken(body: unknown): string {
  const token = isRecord(body) ? body.access_token : undefined;
  return typeof token === "string" && token !== "" ? token : unreadable();
}

export function parseUserId(body: unknown): string {
  return (isRecord(body) ? idText(body.id) : null) ?? unreadable();
}

/** The Pages a person shared, each with its token and whether they hold the ADVERTISE task (spec Q5). */
export function parsePageGrants(body: unknown): MetaPageGrant[] {
  return items(body).map((entry): MetaPageGrant => {
    if (!isRecord(entry)) return unreadable();
    const id = idText(entry.id);
    const token = entry.access_token;
    if (id === null || typeof token !== "string" || token === "") return unreadable();
    const tasks = Array.isArray(entry.tasks) ? entry.tasks : [];
    return { id, name: text(entry.name), token, canAdvertise: tasks.includes("ADVERTISE") };
  });
}

/** Whether our app is among those subscribed to `leadgen` (the Page's subscribed_apps edge). */
export function isSubscribed(body: unknown, appId: string): boolean {
  return items(body).some((entry) => {
    if (!isRecord(entry) || idText(entry.id) !== appId) return false;
    return Array.isArray(entry.subscribed_fields) && entry.subscribed_fields.includes("leadgen");
  });
}

export function parseFormSummaries(body: unknown): MetaFormSummary[] {
  return items(body).map((entry): MetaFormSummary => {
    if (!isRecord(entry)) return unreadable();
    const id = idText(entry.id);
    if (id === null) return unreadable();
    return { id, name: text(entry.name), status: text(entry.status, "ACTIVE") };
  });
}

const questionTypes: Record<string, MetaQuestionType> = {
  FULL_NAME: "full_name",
  FIRST_NAME: "first_name",
  LAST_NAME: "last_name",
  EMAIL: "email",
  PHONE: "phone",
  CITY: "city",
  STATE: "state",
  ZIP: "zip",
  CUSTOM: "custom",
};

export function parseFormDescription(body: unknown): MetaFormDescription {
  if (!isRecord(body)) return unreadable();
  const id = idText(body.id);
  if (id === null || !Array.isArray(body.questions)) return unreadable();
  const questions = body.questions.map((entry: unknown): MetaFormQuestion => {
    if (!isRecord(entry)) return unreadable();
    const key = idText(entry.key);
    if (key === null) return unreadable();
    return { key, type: questionTypes[text(entry.type).toUpperCase()] ?? "other", label: text(entry.label, key) };
  });
  return { id, name: text(body.name), status: text(body.status, "ACTIVE"), questions };
}

// SPIKE: Meta's `platform` on a lead is "fb"/"ig" in some answers and "facebook"/"instagram" in others.
function platformOf(value: unknown): MetaLeadPlatform {
  const platform = text(value).toLowerCase();
  if (platform === "fb" || platform === "facebook") return "facebook";
  if (platform === "ig" || platform === "instagram") return "instagram";
  return "other";
}

/** Meta writes +0000 and no colon; Date wants one or the other. */
function timeOf(value: unknown): Date {
  const raw = text(value).replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  const time = new Date(raw);
  return Number.isNaN(time.getTime()) ? unreadable() : time;
}

export function parseLead(body: unknown, fallbackFormId = ""): MetaLead {
  if (!isRecord(body)) return unreadable();
  const id = idText(body.id);
  if (id === null) return unreadable();
  const answers: Record<string, string[]> = {};
  for (const field of Array.isArray(body.field_data) ? (body.field_data as unknown[]) : []) {
    if (!isRecord(field) || typeof field.name !== "string") continue;
    answers[field.name] = Array.isArray(field.values)
      ? field.values.filter((value): value is string => typeof value === "string")
      : [];
  }
  const adName = typeof body.ad_name === "string" && body.ad_name !== "" ? body.ad_name : undefined;
  const campaignName =
    typeof body.campaign_name === "string" && body.campaign_name !== "" ? body.campaign_name : undefined;
  return {
    id,
    formId: idText(body.form_id) ?? fallbackFormId,
    createdAt: timeOf(body.created_time),
    platform: platformOf(body.platform),
    answers,
    ...(adName === undefined ? {} : { adName }),
    ...(campaignName === undefined ? {} : { campaignName }),
  };
}

export function parseLeads(body: unknown, formId: string): MetaPage<MetaLead> {
  return { items: items(body).map((entry) => parseLead(entry, formId)), next: nextCursor(body) };
}

export function parseTokenInspection(body: unknown): MetaTokenInspection {
  const data = isRecord(body) && isRecord(body.data) ? body.data : unreadable();
  const expires = typeof data.expires_at === "number" && data.expires_at > 0 ? new Date(data.expires_at * 1000) : null;
  return {
    valid: data.is_valid === true,
    expiresAt: expires,
    scopes: Array.isArray(data.scopes) ? data.scopes.filter((scope): scope is string => typeof scope === "string") : [],
  };
}

export function parseCreatedId(body: unknown): string {
  return (isRecord(body) ? idText(body.id) : null) ?? unreadable();
}

export function expectSuccess(body: unknown): void {
  if (!isRecord(body) || body.success !== true) unreadable();
}

// The MetaGraph port (spec 6.1, ADR 0034): the only code that calls graph.facebook.com. It reads Pages, lead forms and
// leads, and writes one thing to Meta: the Page's webhook subscription (and, for a test, one test lead). It never posts.

/** One Graph version for the whole product, moved on purpose (spec D1). */
export const META_GRAPH_VERSION = "v25.0";

export type MetaLeadPlatform = "facebook" | "instagram" | "other";

/** A lead as Meta gives it, normalised: answers by Meta's question key (spec 6.1). */
export interface MetaLead {
  id: string;
  formId: string;
  createdAt: Date;
  platform: MetaLeadPlatform;
  answers: Readonly<Record<string, readonly string[]>>;
  adName?: string;
  campaignName?: string;
  /** SPIKE: how a test lead is told from a real one; until settled this is only what the adapter can tell. */
  isTest?: boolean;
}

export interface MetaLoginResult {
  /** The app-scoped id of whoever logged in (the deletion callback finds Pages by it). */
  userId: string;
  /** Short or long lived: used once to list the Pages and then discarded (spec D2). */
  userToken: string;
}

export interface MetaPageGrant {
  id: string;
  name: string;
  /** The Page's access token: held in memory until sealed by the SecretBox, never logged or returned. */
  token: string;
  /** Whether the person holds the ADVERTISE task on the Page (spec Q5). */
  canAdvertise: boolean;
}

export interface MetaFormSummary {
  id: string;
  name: string;
  /** Meta's own status text: ACTIVE, ARCHIVED, DRAFT or DELETED. */
  status: string;
}

export const metaQuestionTypes = [
  "full_name",
  "first_name",
  "last_name",
  "email",
  "phone",
  "city",
  "state",
  "zip",
  "custom",
  "other",
] as const;
export type MetaQuestionType = (typeof metaQuestionTypes)[number];

export interface MetaFormQuestion {
  /** Meta's question key: the name in a lead's field_data. Questions are matched by this, not by wording (spec 3.4). */
  key: string;
  type: MetaQuestionType;
  label: string;
}

export interface MetaFormDescription extends MetaFormSummary {
  questions: readonly MetaFormQuestion[];
}

export interface MetaPage<T> {
  items: readonly T[];
  /** The cursor for the next page; null when there is none. */
  next: string | null;
}

export interface ListLeadsOptions {
  /** Only leads created after this Unix second. */
  since?: number;
  after?: string;
  limit?: number;
}

export interface MetaTokenInspection {
  valid: boolean;
  /** Null for a token that does not expire. */
  expiresAt: Date | null;
  scopes: readonly string[];
}

export const metaGraphErrorReasons = [
  "token_invalid",
  "permission",
  "rate_limited",
  "not_found",
  "unavailable",
] as const;
export type MetaGraphErrorReason = (typeof metaGraphErrorReasons)[number];

/** Meta refused or failed. The message holds the reason and Meta's codes only: never a body, a URL or a token (M2). */
export class MetaGraphError extends Error {
  readonly reason: MetaGraphErrorReason;
  readonly code: number | null;
  readonly subcode: number | null;
  readonly type: string | null;

  constructor(reason: MetaGraphErrorReason, details: { code?: number; subcode?: number; type?: string } = {}) {
    const codes = [details.code, details.subcode].filter((value) => value !== undefined).join("/");
    super(`Meta Graph: ${reason}${codes ? ` (${codes})` : ""}`);
    this.name = "MetaGraphError";
    this.reason = reason;
    this.code = details.code ?? null;
    this.subcode = details.subcode ?? null;
    this.type = details.type ?? null;
  }
}

/** The port's methods, listed so a test can prove the only writes are the subscription and the test lead. */
export const metaGraphMethods = [
  "exchangeLoginCode",
  "listPages",
  "subscribePage",
  "unsubscribePage",
  "pageIsSubscribed",
  "listForms",
  "describeForm",
  "getLead",
  "listLeads",
  "inspectToken",
  "createTestLead",
] as const;

export interface MetaGraph {
  /** SPIKE: whether Facebook Login for Business needs the redirect address here; the real adapter sends it. */
  exchangeLoginCode(code: string, redirectUri: string): Promise<MetaLoginResult>;
  listPages(userToken: string): Promise<readonly MetaPageGrant[]>;
  subscribePage(pageId: string, pageToken: string): Promise<void>;
  unsubscribePage(pageId: string, pageToken: string): Promise<void>;
  pageIsSubscribed(pageId: string, pageToken: string): Promise<boolean>;
  listForms(pageId: string, pageToken: string, options?: { after?: string }): Promise<MetaPage<MetaFormSummary>>;
  describeForm(formId: string, pageToken: string): Promise<MetaFormDescription>;
  getLead(leadId: string, pageToken: string): Promise<MetaLead>;
  listLeads(formId: string, pageToken: string, options?: ListLeadsOptions): Promise<MetaPage<MetaLead>>;
  /** The one call that uses the app token (spec M3). */
  inspectToken(token: string): Promise<MetaTokenInspection>;
  /** SPIKE: works only if Standard Access allows it (spec D8). Returns the new lead's id. */
  createTestLead(formId: string, pageToken: string): Promise<string>;
}

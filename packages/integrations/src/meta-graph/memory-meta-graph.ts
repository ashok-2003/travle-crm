// An in-memory MetaGraph for the domain's, the api's and the journeys' tests: logins, Pages, forms and leads as objects,
// with a settable clock, and fault switches (an expired token, a rate-limited Page, a failure naming a token).
import {
  type ListLeadsOptions,
  type MetaFormDescription,
  type MetaFormQuestion,
  type MetaFormSummary,
  type MetaGraph,
  MetaGraphError,
  type MetaGraphErrorReason,
  type MetaLead,
  type MetaLeadPlatform,
  type MetaLoginResult,
  type MetaPage,
  type MetaPageGrant,
  type MetaTokenInspection,
} from "./meta-graph.js";

interface MemoryForm {
  pageId: string;
  id: string;
  name: string;
  status: string;
  questions: MetaFormQuestion[];
}

export interface MemoryLeadInput {
  id: string;
  formId: string;
  answers: Record<string, string[]>;
  platform?: MetaLeadPlatform;
  /** Defaults to the memory clock. */
  createdAt?: Date;
  adName?: string;
  campaignName?: string;
}

export interface MemoryMetaGraph extends MetaGraph {
  /** A login code that exchanges into this user, who shares these Pages. */
  addLogin(code: string, login: { userId: string; userToken?: string; pages: MetaPageGrant[] }): void;
  addForm(pageId: string, form: { id: string; name: string; status?: string; questions: MetaFormQuestion[] }): void;
  /** Changes a form's questions, as an editor at Meta would. */
  setQuestions(formId: string, questions: MetaFormQuestion[]): void;
  addLead(lead: MemoryLeadInput): MetaLead;
  deleteLead(leadId: string): void;
  /** The clock `createdAt` defaults to, and token expiry is judged against. */
  setNow(now: Date): void;
  advance(milliseconds: number): void;
  /** The token stops working: every call with it fails token_invalid (190). */
  expireToken(token: string): void;
  restoreToken(token: string): void;
  /** Makes the next `times` calls (default 1) fail with this reason, optionally only for one Page's token. */
  failNext(reason: MetaGraphErrorReason, options?: { times?: number; pageId?: string; code?: number }): void;
  /** Makes the next call throw this error as it is: a failure whose message carries a token (M2). */
  throwNext(error: Error): void;
  /** Makes every call over this limit's first N a rate-limit (80005), cleared by setting null. */
  rateLimit(pageId: string, callsAllowed: number | null): void;
  readonly subscribedPages: ReadonlySet<string>;
  readonly calls: { total: number; byMethod: Readonly<Record<string, number>> };
}

/** Plays an async call: a thrown error becomes a rejection, as a real call's would be. */
function settled<T>(work: () => T): Promise<T> {
  try {
    return Promise.resolve(work());
  } catch (error) {
    return Promise.reject(error instanceof Error ? error : new Error("The memory Meta failed"));
  }
}

const defaultLimit = 50;
const codeOf: Record<MetaGraphErrorReason, number> = {
  token_invalid: 190,
  permission: 200,
  rate_limited: 80005,
  not_found: 100,
  unavailable: 2,
};

export function createMemoryMetaGraph(options: { now?: Date } = {}): MemoryMetaGraph {
  let now = options.now ?? new Date("2026-10-23T10:00:00.000Z");
  const logins = new Map<string, { userId: string; userToken: string; pages: MetaPageGrant[] }>();
  const forms = new Map<string, MemoryForm>();
  const leads = new Map<string, MetaLead>();
  const expired = new Set<string>();
  const subscribed = new Set<string>();
  const faults: { reason: MetaGraphErrorReason; times: number; pageId?: string; code?: number }[] = [];
  const throwing: Error[] = [];
  const allowances = new Map<string, { allowed: number; used: number }>();
  const calls = { total: 0, byMethod: {} as Record<string, number> };

  const pageTokens = () => {
    const tokens = new Map<string, string>();
    for (const login of logins.values()) for (const page of login.pages) tokens.set(page.token, page.id);
    return tokens;
  };

  /** Counts the call and plays the faults that apply to it. `pageId` is the Page the call is about, if known. */
  function enter(method: string, token: string, pageId: string | null): void {
    calls.total += 1;
    calls.byMethod[method] = (calls.byMethod[method] ?? 0) + 1;
    const thrown = throwing.shift();
    if (thrown) throw thrown;
    if (expired.has(token)) throw new MetaGraphError("token_invalid", { code: 190, subcode: 463 });
    const fault = faults.find((candidate) => candidate.pageId === undefined || candidate.pageId === pageId);
    if (fault) {
      fault.times -= 1;
      if (fault.times <= 0) faults.splice(faults.indexOf(fault), 1);
      throw new MetaGraphError(fault.reason, { code: fault.code ?? codeOf[fault.reason] });
    }
    const allowance = pageId ? allowances.get(pageId) : undefined;
    if (allowance) {
      allowance.used += 1;
      if (allowance.used > allowance.allowed) throw new MetaGraphError("rate_limited", { code: 80005 });
    }
  }

  function pageOfToken(token: string): string | null {
    return pageTokens().get(token) ?? null;
  }

  function formFor(formId: string, token: string): MemoryForm {
    const form = forms.get(formId);
    if (form?.pageId !== pageOfToken(token)) throw new MetaGraphError("not_found", { code: 100 });
    return form;
  }

  function paged<T>(items: readonly T[], after: string | undefined, limit: number): MetaPage<T> {
    const start = after ? Number(after) : 0;
    const slice = items.slice(start, start + limit);
    const end = start + slice.length;
    return { items: slice, next: end < items.length ? String(end) : null };
  }

  return {
    addLogin(code, login) {
      logins.set(code, {
        userId: login.userId,
        userToken: login.userToken ?? `user-token-${code}`,
        pages: login.pages,
      });
    },
    addForm(pageId, form) {
      forms.set(form.id, {
        pageId,
        id: form.id,
        name: form.name,
        status: form.status ?? "ACTIVE",
        questions: form.questions,
      });
    },
    setQuestions(formId, questions) {
      const form = forms.get(formId);
      if (form) form.questions = questions;
    },
    addLead(input) {
      const lead: MetaLead = {
        id: input.id,
        formId: input.formId,
        createdAt: input.createdAt ?? now,
        platform: input.platform ?? "facebook",
        answers: input.answers,
        ...(input.adName === undefined ? {} : { adName: input.adName }),
        ...(input.campaignName === undefined ? {} : { campaignName: input.campaignName }),
      };
      leads.set(lead.id, lead);
      return lead;
    },
    deleteLead(leadId) {
      leads.delete(leadId);
    },
    setNow(next) {
      now = next;
    },
    advance(milliseconds) {
      now = new Date(now.getTime() + milliseconds);
    },
    expireToken(token) {
      expired.add(token);
    },
    restoreToken(token) {
      expired.delete(token);
    },
    failNext(reason, failure = {}) {
      faults.push({
        reason,
        times: failure.times ?? 1,
        ...(failure.pageId === undefined ? {} : { pageId: failure.pageId }),
        ...(failure.code === undefined ? {} : { code: failure.code }),
      });
    },
    throwNext(error) {
      throwing.push(error);
    },
    rateLimit(pageId, callsAllowed) {
      if (callsAllowed === null) allowances.delete(pageId);
      else allowances.set(pageId, { allowed: callsAllowed, used: 0 });
    },
    get subscribedPages() {
      return subscribed;
    },
    calls,

    exchangeLoginCode(code): Promise<MetaLoginResult> {
      return settled(() => {
        calls.total += 1;
        calls.byMethod.exchangeLoginCode = (calls.byMethod.exchangeLoginCode ?? 0) + 1;
        const thrown = throwing.shift();
        if (thrown) throw thrown;
        const login = logins.get(code);
        if (!login) throw new MetaGraphError("token_invalid", { code: 100, subcode: 36007 });
        return { userId: login.userId, userToken: login.userToken };
      });
    },
    listPages(userToken) {
      return settled(() => {
        enter("listPages", userToken, null);
        const login = [...logins.values()].find((candidate) => candidate.userToken === userToken);
        if (!login) throw new MetaGraphError("token_invalid", { code: 190 });
        return login.pages.map((page) => ({ ...page }));
      });
    },
    subscribePage(pageId, pageToken) {
      return settled(() => {
        enter("subscribePage", pageToken, pageId);
        if (pageOfToken(pageToken) !== pageId) throw new MetaGraphError("permission", { code: 200 });
        subscribed.add(pageId);
      });
    },
    unsubscribePage(pageId, pageToken) {
      return settled(() => {
        enter("unsubscribePage", pageToken, pageId);
        subscribed.delete(pageId);
      });
    },
    pageIsSubscribed(pageId, pageToken) {
      return settled(() => {
        enter("pageIsSubscribed", pageToken, pageId);
        return subscribed.has(pageId);
      });
    },
    listForms(pageId, pageToken, listOptions = {}) {
      return settled(() => {
        enter("listForms", pageToken, pageId);
        if (pageOfToken(pageToken) !== pageId) throw new MetaGraphError("permission", { code: 200 });
        const summaries: MetaFormSummary[] = [...forms.values()]
          .filter((form) => form.pageId === pageId)
          .map((form) => ({ id: form.id, name: form.name, status: form.status }));
        return paged(summaries, listOptions.after, defaultLimit);
      });
    },
    describeForm(formId, pageToken): Promise<MetaFormDescription> {
      return settled(() => {
        const form = forms.get(formId);
        enter("describeForm", pageToken, form?.pageId ?? null);
        const found = formFor(formId, pageToken);
        return {
          id: found.id,
          name: found.name,
          status: found.status,
          questions: found.questions.map((q) => ({ ...q })),
        };
      });
    },
    getLead(leadId, pageToken) {
      return settled(() => {
        const lead = leads.get(leadId);
        const form = lead ? forms.get(lead.formId) : undefined;
        enter("getLead", pageToken, form?.pageId ?? null);
        if (!lead || form?.pageId !== pageOfToken(pageToken)) throw new MetaGraphError("not_found", { code: 100 });
        return lead;
      });
    },
    listLeads(formId, pageToken, listOptions: ListLeadsOptions = {}) {
      return settled(() => {
        const form = forms.get(formId);
        enter("listLeads", pageToken, form?.pageId ?? null);
        formFor(formId, pageToken);
        const since = listOptions.since ?? 0;
        const matching = [...leads.values()]
          .filter((lead) => lead.formId === formId && Math.floor(lead.createdAt.getTime() / 1000) > since)
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        return paged(matching, listOptions.after, listOptions.limit ?? defaultLimit);
      });
    },
    inspectToken(token): Promise<MetaTokenInspection> {
      return settled(() => {
        calls.total += 1;
        calls.byMethod.inspectToken = (calls.byMethod.inspectToken ?? 0) + 1;
        const thrown = throwing.shift();
        if (thrown) throw thrown;
        const known = pageOfToken(token) !== null;
        return { valid: known && !expired.has(token), expiresAt: null, scopes: [] };
      });
    },
    createTestLead(formId, pageToken) {
      return settled(() => {
        const form = forms.get(formId);
        enter("createTestLead", pageToken, form?.pageId ?? null);
        formFor(formId, pageToken);
        const id = `test-lead-${formId}`;
        if (leads.has(id)) throw new MetaGraphError("not_found", { code: 100 });
        leads.set(id, { id, formId, createdAt: now, platform: "facebook", answers: {}, isTest: true });
        return id;
      });
    },
  };
}

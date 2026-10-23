// The real MetaGraph: plain fetch to graph.facebook.com (ADR 0034, spec 6.1). Every request has a timeout, goes to the one
// pinned version, and carries its token in an Authorization header, never the URL; the app secret and a login code go in a
// POST body. A network error is retried once; Meta's errors become our five reasons carrying its codes and nothing else.
// Nothing here posts, replies or edits: the writes are the Page's webhook subscription and an optional test lead.
import { createHmac } from "node:crypto";
import {
  expectSuccess,
  isSubscribed,
  mapMetaError,
  nextCursor,
  parseAccessToken,
  parseCreatedId,
  parseFormDescription,
  parseFormSummaries,
  parseLead,
  parseLeads,
  parsePageGrants,
  parseTokenInspection,
  parseUserId,
} from "./meta-responses.js";
import {
  type ListLeadsOptions,
  META_GRAPH_VERSION,
  type MetaFormDescription,
  type MetaFormSummary,
  type MetaGraph,
  MetaGraphError,
  type MetaLead,
  type MetaLoginResult,
  type MetaPage,
  type MetaPageGrant,
  type MetaTokenInspection,
} from "./meta-graph.js";

export interface RealMetaGraphOptions {
  appId: string;
  appSecret: string;
  /** Default https://graph.facebook.com; the journeys point it at their fake (development and tests only). */
  baseUrl?: string;
  fetch?: typeof fetch;
  /** 10 seconds. */
  timeoutMs?: number;
}

const leadFields = "id,created_time,field_data,ad_id,ad_name,form_id,platform";
/** Ids that go into a URL path: Meta's own, digits in practice. Anything else never reaches a URL. */
const idPattern = /^[A-Za-z0-9_-]{1,64}$/;

function pathId(id: string): string {
  if (!idPattern.test(id)) throw new MetaGraphError("not_found");
  return id;
}

interface Request {
  method: "GET" | "POST" | "DELETE";
  path: string;
  query?: Record<string, string>;
  /** Sent as a form body, so a secret or a code is never in a URL. */
  form?: Record<string, string>;
  token?: string;
}

export function createRealMetaGraph(options: RealMetaGraphOptions): MetaGraph {
  const root = `${(options.baseUrl ?? "https://graph.facebook.com").replace(/\/$/, "")}/${META_GRAPH_VERSION}`;
  const send = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const appToken = `${options.appId}|${options.appSecret}`;

  async function attempt(request: Request): Promise<unknown> {
    const url = new URL(`${root}${request.path}`);
    for (const [name, value] of Object.entries(request.query ?? {})) url.searchParams.set(name, value);
    const headers: Record<string, string> = { Accept: "application/json" };
    if (request.token !== undefined) {
      headers.Authorization = `Bearer ${request.token}`;
      // Proves the call comes from our app: a leaked token is useless without the secret, and it keeps working if Meta's
      // "Require App Secret" is switched on (review M9).
      if (request.token !== appToken) {
        url.searchParams.set(
          "appsecret_proof",
          createHmac("sha256", options.appSecret).update(request.token).digest("hex"),
        );
      }
    }
    let body: string | undefined;
    if (request.form !== undefined) {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      body = new URLSearchParams(request.form).toString();
    }
    const response = await send(url, {
      method: request.method,
      headers,
      ...(body === undefined ? {} : { body }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    let json: unknown;
    try {
      json = await response.json();
    } catch {
      json = null;
    }
    if (!response.ok) throw mapMetaError(response.status, json);
    return json;
  }

  /** One retry on a network error (a socket, a timeout); Meta's own answers are never retried here. */
  async function call(request: Request): Promise<unknown> {
    try {
      return await attempt(request);
    } catch (error) {
      if (error instanceof MetaGraphError) throw error;
      try {
        return await attempt(request);
      } catch (again) {
        // Whatever it was, its message may hold the URL: it is not kept.
        if (again instanceof MetaGraphError) throw again;
        throw new MetaGraphError("unavailable");
      }
    }
  }

  return {
    async exchangeLoginCode(code, redirectUri): Promise<MetaLoginResult> {
      // SPIKE: Login for Business with a system-user configuration answers the code with a token that does not expire and
      // needs no exchange; a user configuration answers a short-lived one, exchanged here for a long-lived one.
      const first = parseAccessToken(
        await call({
          method: "POST",
          path: "/oauth/access_token",
          form: { client_id: options.appId, client_secret: options.appSecret, redirect_uri: redirectUri, code },
        }),
      );
      let userToken = first;
      try {
        userToken = parseAccessToken(
          await call({
            method: "POST",
            path: "/oauth/access_token",
            form: {
              grant_type: "fb_exchange_token",
              client_id: options.appId,
              client_secret: options.appSecret,
              fb_exchange_token: first,
            },
          }),
        );
      } catch (error) {
        // A token that cannot be exchanged (a system user's) is used as it is; any other failure is the caller's.
        if (!(error instanceof MetaGraphError) || error.reason === "unavailable" || error.reason === "rate_limited")
          throw error;
      }
      const userId = parseUserId(await call({ method: "GET", path: "/me", query: { fields: "id" }, token: userToken }));
      return { userId, userToken };
    },

    async listPages(userToken): Promise<readonly MetaPageGrant[]> {
      const grants: MetaPageGrant[] = [];
      let after: string | undefined;
      for (let pages = 0; pages < 10; pages += 1) {
        const body = await call({
          method: "GET",
          path: "/me/accounts",
          query: { fields: "id,name,access_token,tasks", limit: "100", ...(after === undefined ? {} : { after }) },
          token: userToken,
        });
        grants.push(...parsePageGrants(body));
        const next = nextCursor(body);
        if (next === null) break;
        after = next;
      }
      return grants;
    },

    async subscribePage(pageId, pageToken): Promise<void> {
      expectSuccess(
        await call({
          method: "POST",
          path: `/${pathId(pageId)}/subscribed_apps`,
          form: { subscribed_fields: "leadgen" },
          token: pageToken,
        }),
      );
    },

    async unsubscribePage(pageId, pageToken): Promise<void> {
      expectSuccess(await call({ method: "DELETE", path: `/${pathId(pageId)}/subscribed_apps`, token: pageToken }));
    },

    async pageIsSubscribed(pageId, pageToken): Promise<boolean> {
      return isSubscribed(
        await call({ method: "GET", path: `/${pathId(pageId)}/subscribed_apps`, token: pageToken }),
        options.appId,
      );
    },

    async listForms(pageId, pageToken, listOptions = {}): Promise<MetaPage<MetaFormSummary>> {
      const body = await call({
        method: "GET",
        path: `/${pathId(pageId)}/leadgen_forms`,
        query: {
          fields: "id,name,status",
          limit: "100",
          ...(listOptions.after === undefined ? {} : { after: listOptions.after }),
        },
        token: pageToken,
      });
      return { items: parseFormSummaries(body), next: nextCursor(body) };
    },

    async describeForm(formId, pageToken): Promise<MetaFormDescription> {
      return parseFormDescription(
        await call({
          method: "GET",
          path: `/${pathId(formId)}`,
          query: { fields: "id,name,status,questions" },
          token: pageToken,
        }),
      );
    },

    async getLead(leadId, pageToken): Promise<MetaLead> {
      try {
        return parseLead(
          await call({ method: "GET", path: `/${pathId(leadId)}`, query: { fields: leadFields }, token: pageToken }),
        );
      } catch (error) {
        // Code 100 with subcode 33 ("does not exist or missing permissions") also answers a lead fetched moments after its
        // webhook: it is tried again, and the catch-up's list carries the lead if it is there (review I4).
        if (error instanceof MetaGraphError && error.reason === "not_found" && error.subcode === 33) {
          throw new MetaGraphError("unavailable", {
            code: 100,
            subcode: 33,
            ...(error.type === null ? {} : { type: error.type }),
          });
        }
        throw error;
      }
    },

    async listLeads(formId, pageToken, listOptions: ListLeadsOptions = {}): Promise<MetaPage<MetaLead>> {
      const filtering =
        listOptions.since === undefined
          ? {}
          : {
              filtering: JSON.stringify([
                { field: "time_created", operator: "GREATER_THAN", value: listOptions.since },
              ]),
            };
      return parseLeads(
        await call({
          method: "GET",
          path: `/${pathId(formId)}/leads`,
          query: {
            fields: leadFields,
            limit: String(listOptions.limit ?? 50),
            ...filtering,
            ...(listOptions.after === undefined ? {} : { after: listOptions.after }),
          },
          token: pageToken,
        }),
        formId,
      );
    },

    async inspectToken(token): Promise<MetaTokenInspection> {
      // SPIKE: debug_token takes the inspected token as a parameter (a GET query); it is the one call that has a token in
      // its URL, which no error or log ever holds. The app token goes in the header.
      return parseTokenInspection(
        await call({ method: "GET", path: "/debug_token", query: { input_token: token }, token: appToken }),
      );
    },

    async createTestLead(formId, pageToken): Promise<string> {
      // SPIKE: whether a role holder may make a test lead under Standard Access.
      return parseCreatedId(
        await call({ method: "POST", path: `/${pathId(formId)}/test_leads`, form: {}, token: pageToken }),
      );
    },
  };
}

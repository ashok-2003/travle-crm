// A fake Meta for the journeys (spec 12): the Graph endpoints the real adapter calls, over HTTP, answering errors in Meta's own
// body shapes, played from one in-memory Meta (logins, Pages, forms, leads); and a control surface the journeys use to make
// Pages, forms and leads, expire a token or break a call. The api and the worker run their real adapter against it (the
// Graph test server's URL), so what the journeys see is what the product does; nothing here is ever sent to Meta.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  createMemoryMetaGraph,
  META_GRAPH_VERSION,
  MetaGraphError,
  type MemoryLeadInput,
  type MemoryMetaGraph,
  type MetaFormQuestion,
  type MetaGraphErrorReason,
  type MetaLead,
  type MetaPageGrant,
} from "@travel-crm/integrations/meta-graph";

/** The five Meta settings the api and the worker run with in the journeys: test values, for this run only. */
export const META_E2E = {
  appId: "1234567890123456",
  appSecret: "e2e0meta0app0secret0abcdef0123456",
  verifyToken: "e2e-meta-verify-token-0123456789-abcdefghij",
  loginConfigId: "9876543210987654",
  tokenKey: Buffer.alloc(32, "meta-e2e").toString("base64"),
} as const;

interface FailOptions {
  times?: number;
  pageId?: string;
  code?: number;
}

/** A lead as a journey makes it: `createdAt` is an instant, sent as text. */
export type NewMetaLead = Omit<MemoryLeadInput, "createdAt"> & { createdAt?: Date };

/** What the journeys do to the fake, each a call to its control surface. */
export interface FakeMetaClient {
  /** A login code that exchanges into this user, who shares these Pages. */
  addLogin(code: string, login: { userId: string; userToken?: string; pages: MetaPageGrant[] }): Promise<void>;
  addForm(
    pageId: string,
    form: { id: string; name: string; status?: string; questions: MetaFormQuestion[] },
  ): Promise<void>;
  setQuestions(formId: string, questions: MetaFormQuestion[]): Promise<void>;
  addLead(lead: NewMetaLead): Promise<void>;
  deleteLead(leadId: string): Promise<void>;
  expireToken(token: string): Promise<void>;
  restoreToken(token: string): Promise<void>;
  failNext(reason: MetaGraphErrorReason, options?: FailOptions): Promise<void>;
  /** The Pages whose webhook subscription the product holds. */
  subscribedPages(): Promise<string[]>;
  calls(): Promise<{ total: number; byMethod: Record<string, number> }>;
}

export interface FakeMeta {
  /** The base URL the api and the worker are given as META_GRAPH_TEST_SERVER_URL. */
  url: string;
  stop(): Promise<void>;
  client: FakeMetaClient;
}

/** The client of a fake that is running at `url`, for the journeys' own processes (E2E_META_URL). */
export function fakeMetaClient(url: string): FakeMetaClient {
  const call = async <T>(method: string, ...args: unknown[]): Promise<T> => {
    const response = await fetch(new URL(`/control/${method}`, url), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(args),
    });
    if (!response.ok) throw new Error(`The fake Meta refused ${method}: ${await response.text()}`);
    return (await response.json()) as T;
  };
  const run = async (method: string, ...args: unknown[]): Promise<void> => {
    await call(method, ...args);
  };
  return {
    addLogin: (code, login) => run("addLogin", code, login),
    addForm: (pageId, form) => run("addForm", pageId, form),
    setQuestions: (formId, questions) => run("setQuestions", formId, questions),
    addLead: (lead) => run("addLead", lead),
    deleteLead: (leadId) => run("deleteLead", leadId),
    expireToken: (token) => run("expireToken", token),
    restoreToken: (token) => run("restoreToken", token),
    failNext: (reason, options) => run("failNext", reason, options ?? {}),
    subscribedPages: () => call("subscribedPages"),
    calls: () => call("calls"),
  };
}

const wireTypes: Record<string, string> = {
  full_name: "FULL_NAME",
  first_name: "FIRST_NAME",
  last_name: "LAST_NAME",
  email: "EMAIL",
  phone: "PHONE",
  city: "CITY",
  state: "STATE",
  zip: "ZIP",
  custom: "CUSTOM",
};

const wirePlatforms: Record<string, string> = { facebook: "fb", instagram: "ig" };

/** A lead as Graph writes it: the answers as field_data, the time with +0000, the platform as fb or ig. */
function leadOnTheWire(lead: MetaLead) {
  return {
    id: lead.id,
    created_time: lead.createdAt.toISOString().replace("Z", "+0000"),
    form_id: lead.formId,
    platform: wirePlatforms[lead.platform] ?? "other",
    field_data: Object.entries(lead.answers).map(([name, values]) => ({ name, values })),
    ...(lead.adName === undefined ? {} : { ad_name: lead.adName }),
  };
}

function pagingOf(next: string | null) {
  return next === null ? {} : { paging: { cursors: { after: next }, next: "https://graph.invalid/next" } };
}

/** Meta's own error body for a refusal of the memory Meta (the real adapter reads it back into the same reason). */
function errorAnswer(error: unknown): { status: number; body: unknown } {
  const failure = error instanceof MetaGraphError ? error : new MetaGraphError("unavailable", { code: 2 });
  return {
    status: failure.reason === "unavailable" ? 500 : 400,
    body: {
      error: {
        message: "The fake Meta refused",
        type: failure.type ?? "OAuthException",
        code: failure.code ?? 2,
        ...(failure.subcode === null ? {} : { error_subcode: failure.subcode }),
      },
    },
  };
}

async function textOf(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

const bearerOf = (request: IncomingMessage): string => (request.headers.authorization ?? "").replace(/^Bearer /, "");

/** The Graph endpoint a request is for, after the version: [first, second] path parts. */
function graphRoute(pathname: string): string[] | null {
  const prefix = `/${META_GRAPH_VERSION}/`;
  return pathname.startsWith(prefix) ? pathname.slice(prefix.length).split("/").map(decodeURIComponent) : null;
}

async function answerGraph(
  meta: MemoryMetaGraph,
  userOfToken: Map<string, string>,
  request: IncomingMessage,
  url: URL,
  parts: string[],
): Promise<unknown> {
  const token = bearerOf(request);
  const [first = "", second] = parts;
  const method = request.method ?? "GET";

  if (method === "POST" && first === "oauth" && second === "access_token") {
    const form = new URLSearchParams(await textOf(request));
    const exchanged = form.get("fb_exchange_token");
    if (exchanged !== null) return { access_token: exchanged };
    const login = await meta.exchangeLoginCode(form.get("code") ?? "", form.get("redirect_uri") ?? "");
    userOfToken.set(login.userToken, login.userId);
    return { access_token: login.userToken };
  }
  if (method === "GET" && first === "me" && second === undefined) {
    const id = userOfToken.get(token);
    if (id === undefined) throw new MetaGraphError("token_invalid", { code: 190 });
    return { id };
  }
  if (method === "GET" && first === "me" && second === "accounts") {
    const grants = await meta.listPages(token);
    return {
      data: grants.map((grant) => ({
        id: grant.id,
        name: grant.name,
        access_token: grant.token,
        tasks: grant.canAdvertise ? ["ADVERTISE", "MANAGE"] : ["MANAGE"],
      })),
    };
  }
  if (method === "GET" && first === "debug_token") {
    const inspected = await meta.inspectToken(url.searchParams.get("input_token") ?? "");
    return { data: { is_valid: inspected.valid, expires_at: 0, scopes: inspected.scopes } };
  }
  if (second === "subscribed_apps") {
    if (method === "POST") {
      await meta.subscribePage(first, token);
      return { success: true };
    }
    if (method === "DELETE") {
      await meta.unsubscribePage(first, token);
      return { success: true };
    }
    const subscribed = await meta.pageIsSubscribed(first, token);
    return { data: subscribed ? [{ id: META_E2E.appId, subscribed_fields: ["leadgen"] }] : [] };
  }
  if (method === "GET" && second === "leadgen_forms") {
    const after = url.searchParams.get("after") ?? undefined;
    const page = await meta.listForms(first, token, after === undefined ? {} : { after });
    return { data: page.items.map(({ id, name, status }) => ({ id, name, status })), ...pagingOf(page.next) };
  }
  if (method === "GET" && second === "leads") {
    const filtering = url.searchParams.get("filtering");
    const since = filtering === null ? undefined : Number((JSON.parse(filtering) as { value: number }[])[0]?.value);
    const after = url.searchParams.get("after") ?? undefined;
    const limit = Number(url.searchParams.get("limit") ?? 50);
    const page = await meta.listLeads(first, token, {
      limit,
      ...(since === undefined ? {} : { since }),
      ...(after === undefined ? {} : { after }),
    });
    return { data: page.items.map(leadOnTheWire), ...pagingOf(page.next) };
  }
  if (method === "POST" && second === "test_leads") return { id: await meta.createTestLead(first, token) };
  if (method === "GET" && second === undefined) {
    // A form asks for its questions; a lead for its answers.
    if ((url.searchParams.get("fields") ?? "").includes("questions")) {
      const form = await meta.describeForm(first, token);
      return {
        id: form.id,
        name: form.name,
        status: form.status,
        questions: form.questions.map(({ key, type, label }) => ({ key, type: wireTypes[type] ?? "OTHER", label })),
      };
    }
    return leadOnTheWire(await meta.getLead(first, token));
  }
  throw new MetaGraphError("not_found", { code: 100 });
}

export async function startFakeMeta(): Promise<FakeMeta> {
  const meta = createMemoryMetaGraph({ now: new Date() });
  const userOfToken = new Map<string, string>();

  /** The control surface: the memory Meta's own methods by name. */
  const controls: Record<string, (...args: never[]) => unknown> = {
    addLogin: (code: string, login: Parameters<MemoryMetaGraph["addLogin"]>[1]) => {
      meta.addLogin(code, login);
      userOfToken.set(login.userToken ?? `user-token-${code}`, login.userId);
    },
    addForm: (pageId: string, form: Parameters<MemoryMetaGraph["addForm"]>[1]) => {
      meta.addForm(pageId, form);
    },
    setQuestions: (formId: string, questions: MetaFormQuestion[]) => {
      meta.setQuestions(formId, questions);
    },
    addLead: (lead: Omit<MemoryLeadInput, "createdAt"> & { createdAt?: string }) => {
      const { createdAt, ...rest } = lead;
      meta.addLead({ ...rest, ...(createdAt === undefined ? {} : { createdAt: new Date(createdAt) }) });
    },
    deleteLead: (leadId: string) => {
      meta.deleteLead(leadId);
    },
    expireToken: (token: string) => {
      meta.expireToken(token);
    },
    restoreToken: (token: string) => {
      meta.restoreToken(token);
    },
    failNext: (reason: MetaGraphErrorReason, options: FailOptions) => {
      meta.failNext(reason, options);
    },
    subscribedPages: () => [...meta.subscribedPages],
    calls: () => meta.calls,
  };

  const server = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? "/", "http://fake-meta");
      try {
        const control = /^\/control\/(\w+)$/.exec(url.pathname);
        if (control !== null && request.method === "POST") {
          const handler = controls[control[1] ?? ""];
          if (handler === undefined) {
            send(response, 404, { error: "no such control" });
            return;
          }
          const text = await textOf(request);
          const args = text === "" ? [] : (JSON.parse(text) as unknown[]);
          send(response, 200, handler(...(args as never[])) ?? null);
          return;
        }
        const parts = graphRoute(url.pathname);
        if (parts === null) {
          send(response, 404, { error: { code: 100, message: "No such endpoint", type: "GraphMethodException" } });
          return;
        }
        send(response, 200, await answerGraph(meta, userOfToken, request, url, parts));
      } catch (error) {
        const answer = errorAnswer(error);
        send(response, answer.status, answer.body);
      }
    })();
  });
  const port = await new Promise<number>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address !== null && typeof address === "object") resolve(address.port);
      else reject(new Error("no port"));
    });
  });
  const url = `http://127.0.0.1:${String(port)}`;
  return {
    url,
    stop: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => {
          resolve();
        });
      }),
    client: fakeMetaClient(url),
  };
}

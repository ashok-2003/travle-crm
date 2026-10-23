// The real MetaGraph against recorded responses (spec 6.1): the shapes it reads, the one pinned version, the token in a
// header and never in a URL, the secrets in a POST body, Meta's errors mapped to our five reasons carrying codes only, one
// retry of a network error, and no write but the subscription and a test lead.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createRealMetaGraph, MetaGraphError } from "../../src/meta-graph/index.js";

const recorded = (name: string): unknown =>
  JSON.parse(readFileSync(path.join(import.meta.dirname, "recorded", `${name}.json`), "utf8")) as unknown;

interface Seen {
  method: string;
  url: URL;
  authorization: string | null;
  body: string | null;
}

/** A fetch that answers in order what the test queues, and remembers what it was asked. */
function fakeFetch(answers: unknown[]) {
  const seen: Seen[] = [];
  const queue = [...answers];
  const send = (input: URL | string, init?: RequestInit): Promise<Response> => {
    const headers = new Headers(init?.headers);
    seen.push({
      method: init?.method ?? "GET",
      url: new URL(String(input)),
      authorization: headers.get("authorization"),
      body: typeof init?.body === "string" ? init.body : null,
    });
    const next = queue.shift();
    if (next instanceof Error) return Promise.reject(next);
    const answer =
      typeof next === "object" && next !== null && "status" in next && "body" in next
        ? (next as { status: number; body: unknown })
        : { status: 200, body: next };
    return Promise.resolve(
      new Response(JSON.stringify(answer.body), {
        status: answer.status,
        headers: { "content-type": "application/json" },
      }),
    );
  };
  return { send: send as typeof fetch, seen };
}

const graphWith = (answers: Parameters<typeof fakeFetch>[0]) => {
  const fake = fakeFetch(answers);
  return {
    fake,
    graph: createRealMetaGraph({
      appId: "1234567890",
      appSecret: "secret-app-value-0123456789abcdef",
      fetch: fake.send,
    }),
  };
};
const failure = async (promise: Promise<unknown>) => {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(MetaGraphError);
  return error as MetaGraphError;
};

describe("the login", () => {
  it("exchanges the code in a POST body, then for a long-lived token, and reads the user id with a bearer token", async () => {
    const { fake, graph } = graphWith([recorded("access-token"), recorded("access-token-long"), recorded("me")]);
    const login = await graph.exchangeLoginCode(
      "the-login-code",
      "https://app.example.in/settings/lead-sources/meta/callback",
    );
    expect(login).toEqual({ userId: "10159876543210987", userToken: "EAAB-user-long" });
    const [first, second, third] = fake.seen;
    expect(first?.method).toBe("POST");
    expect(first?.url.pathname).toBe("/v25.0/oauth/access_token");
    expect(first?.url.search).toBe("");
    const form = new URLSearchParams(first?.body ?? "");
    expect(Object.fromEntries(form)).toMatchObject({
      client_id: "1234567890",
      code: "the-login-code",
      redirect_uri: "https://app.example.in/settings/lead-sources/meta/callback",
    });
    expect(form.get("client_secret")).toBe("secret-app-value-0123456789abcdef");
    expect(new URLSearchParams(second?.body ?? "").get("grant_type")).toBe("fb_exchange_token");
    expect(third?.url.pathname).toBe("/v25.0/me");
    expect(third?.authorization).toBe("Bearer EAAB-user-long");
    // Neither a secret nor a code nor a token is in any address.
    for (const seen of fake.seen) expect(seen.url.href).not.toMatch(/secret-app|the-login-code|EAAB/);
  });

  it("uses a token that cannot be exchanged as it is", async () => {
    const { graph } = graphWith([
      recorded("access-token"),
      { status: 400, body: recorded("error-unknown-object") },
      recorded("me"),
    ]);
    expect((await graph.exchangeLoginCode("c", "https://x")).userToken).toBe("EAAB-user-short");
  });

  it("refuses a code Meta does not accept", async () => {
    const { graph } = graphWith([{ status: 400, body: recorded("error-unknown-object") }]);
    expect((await failure(graph.exchangeLoginCode("bad", "https://x"))).reason).toBe("not_found");
  });
});

describe("Pages", () => {
  it("lists the Pages across pages of results, with each token and whether the person can advertise", async () => {
    const { fake, graph } = graphWith([recorded("me-accounts-1"), recorded("me-accounts-2")]);
    const pages = await graph.listPages("EAAB-user-long");
    expect(pages.map((page) => [page.id, page.name, page.token, page.canAdvertise])).toEqual([
      ["112233445566778", "Yatra Hikes", "EAAB-page-1", true],
      ["998877665544332", "Reader Only", "EAAB-page-2", false],
      ["555666777888999", "Spiti Escapes", "EAAB-page-3", true],
    ]);
    expect(fake.seen[0]?.authorization).toBe("Bearer EAAB-user-long");
    // The next page is asked by its cursor, never by following the address Meta gives, which holds a token.
    expect(fake.seen[1]?.url.searchParams.get("after")).toBe("QVFJ");
    expect(fake.seen.every((seen) => !seen.url.searchParams.has("access_token"))).toBe(true);
  });

  it("subscribes to leadgen with a POST, unsubscribes with a DELETE, and reads whether our app is subscribed", async () => {
    const { fake, graph } = graphWith([
      recorded("success"),
      recorded("success"),
      recorded("subscribed-apps"),
      recorded("subscribed-apps-other"),
    ]);
    await graph.subscribePage("112233445566778", "EAAB-page-1");
    await graph.unsubscribePage("112233445566778", "EAAB-page-1");
    expect(await graph.pageIsSubscribed("112233445566778", "EAAB-page-1")).toBe(true);
    expect(await graph.pageIsSubscribed("112233445566778", "EAAB-page-1")).toBe(false);
    expect(fake.seen.map((seen) => [seen.method, seen.url.pathname])).toEqual([
      ["POST", "/v25.0/112233445566778/subscribed_apps"],
      ["DELETE", "/v25.0/112233445566778/subscribed_apps"],
      ["GET", "/v25.0/112233445566778/subscribed_apps"],
      ["GET", "/v25.0/112233445566778/subscribed_apps"],
    ]);
    expect(new URLSearchParams(fake.seen[0]?.body ?? "").get("subscribed_fields")).toBe("leadgen");
    expect(fake.seen.every((seen) => seen.authorization === "Bearer EAAB-page-1")).toBe(true);
  });

  it("refuses a body that is not the subscription's success", async () => {
    const { graph } = graphWith([{ success: false }]);
    expect((await failure(graph.subscribePage("112233445566778", "t"))).reason).toBe("unavailable");
  });

  it("never lets an id that is not Meta's reach a URL", async () => {
    const { fake, graph } = graphWith([]);
    expect((await failure(graph.subscribePage("../me/accounts", "t"))).reason).toBe("not_found");
    expect((await failure(graph.getLead("123?access_token=x", "t"))).reason).toBe("not_found");
    expect(fake.seen).toEqual([]);
  });
});

describe("forms", () => {
  it("lists forms and pages them by cursor", async () => {
    const { fake, graph } = graphWith([recorded("leadgen-forms")]);
    const page = await graph.listForms("112233445566778", "EAAB-page-1");
    expect(page.items).toEqual([
      { id: "7001", name: "Rajasthan winter ad", status: "ACTIVE" },
      { id: "7002", name: "Diwali offers", status: "ARCHIVED" },
    ]);
    expect(page.next).toBe("MQZDZD");
    expect(fake.seen[0]?.url.pathname).toBe("/v25.0/112233445566778/leadgen_forms");
  });

  it("describes a form's questions by Meta's key, normalising the types", async () => {
    const { graph } = graphWith([recorded("leadgen-form")]);
    const form = await graph.describeForm("7001", "EAAB-page-1");
    expect(form.questions.map((question) => [question.key, question.type, question.label])).toEqual([
      ["full_name", "full_name", "Full name"],
      ["phone_number", "phone", "Phone number"],
      ["email", "email", "Email"],
      ["city", "city", "City"],
      ["where_do_you_want_to_go?", "custom", "Where do you want to go?"],
      ["gst_number", "other", "GST"],
    ]);
  });
});

describe("leads", () => {
  it("reads one lead's answers by Meta's question key, its time, platform and ad", async () => {
    const { fake, graph } = graphWith([recorded("lead"), recorded("lead-no-ad")]);
    const lead = await graph.getLead("90001", "EAAB-page-1");
    expect(lead).toEqual({
      id: "90001",
      formId: "7001",
      createdAt: new Date("2026-10-23T09:59:00Z"),
      platform: "instagram",
      adName: "Winter Rajasthan - carousel",
      answers: {
        full_name: ["Asha Rao"],
        phone_number: ["p:+919876543210"],
        email: ["asha@example.test"],
        "where_do_you_want_to_go?": ["Jaisalmer", "Udaipur"],
      },
    });
    const plain = await graph.getLead("90002", "EAAB-page-1");
    expect(plain.platform).toBe("facebook");
    expect(plain).not.toHaveProperty("adName");
    expect(fake.seen[0]?.url.searchParams.get("fields")).toContain("field_data");
  });

  it("lists a form's leads after a time, 50 a page, by cursor, reading an unknown platform as other", async () => {
    const { fake, graph } = graphWith([recorded("leads-page-1"), recorded("leads-page-2")]);
    const first = await graph.listLeads("7001", "EAAB-page-1", { since: 1_761_213_000 });
    expect(first.items.map((lead) => [lead.id, lead.platform])).toEqual([
      ["90003", "facebook"],
      ["90004", "other"],
    ]);
    expect(first.next).toBe("QVFC");
    const second = await graph.listLeads("7001", "EAAB-page-1", { after: first.next ?? "" });
    expect(second.items.map((lead) => lead.id)).toEqual(["90005"]);
    expect(second.next).toBeNull();
    const url = fake.seen[0]?.url;
    expect(url?.pathname).toBe("/v25.0/7001/leads");
    expect(url?.searchParams.get("limit")).toBe("50");
    expect(JSON.parse(url?.searchParams.get("filtering") ?? "[]")).toEqual([
      { field: "time_created", operator: "GREATER_THAN", value: 1_761_213_000 },
    ]);
    expect(fake.seen[1]?.url.searchParams.get("after")).toBe("QVFC");
  });

  it("makes a test lead with a POST", async () => {
    const { fake, graph } = graphWith([recorded("test-lead")]);
    expect(await graph.createTestLead("7001", "EAAB-page-1")).toBe("90099");
    expect(fake.seen[0]).toMatchObject({ method: "POST" });
    expect(fake.seen[0]?.url.pathname).toBe("/v25.0/7001/test_leads");
  });
});

describe("the token", () => {
  it("inspects a token with the app token in a header, reading when it ends", async () => {
    const { fake, graph } = graphWith([
      recorded("debug-token"),
      recorded("debug-token-never"),
      recorded("debug-token-invalid"),
    ]);
    expect(await graph.inspectToken("EAAB-page-1")).toEqual({
      valid: true,
      expiresAt: new Date(1_763_000_000_000),
      scopes: ["pages_show_list", "leads_retrieval", "pages_manage_metadata"],
    });
    expect(await graph.inspectToken("EAAB-page-1")).toMatchObject({ valid: true, expiresAt: null });
    expect(await graph.inspectToken("EAAB-page-1")).toMatchObject({ valid: false });
    expect(fake.seen[0]?.authorization).toBe("Bearer 1234567890|secret-app-value-0123456789abcdef");
  });
});

describe("Meta's errors", () => {
  const cases: [
    string,
    number,
    "token_invalid" | "permission" | "rate_limited" | "not_found" | "unavailable",
    number,
  ][] = [
    ["error-token-expired", 400, "token_invalid", 190],
    ["error-permission", 403, "permission", 200],
    ["error-lead-permission", 403, "permission", 10],
    ["error-rate-limit", 400, "rate_limited", 80005],
    ["error-unknown-object", 400, "not_found", 100],
    ["error-unavailable", 500, "unavailable", 2],
  ];

  it.each(cases)("reads %s as %s with its code, and keeps no message", async (name, status, reason, code) => {
    const { graph } = graphWith([{ status, body: recorded(name) }]);
    const error = await failure(graph.getLead("90001", "EAAB-page-1"));
    expect(error.reason).toBe(reason);
    expect(error.code).toBe(code);
    expect(error.message).not.toMatch(/Session has expired|pages_manage_ads|too many calls|Unsupported get/);
  });

  it("reads the token error's subcode, and a 429 or an answer with no JSON by its status", async () => {
    const { graph } = graphWith([{ status: 400, body: recorded("error-token-expired") }]);
    expect((await failure(graph.getLead("90001", "t"))).subcode).toBe(463);
    const limited = graphWith([{ status: 429, body: {} }]);
    expect((await failure(limited.graph.getLead("90001", "t"))).reason).toBe("rate_limited");
    const html = graphWith([{ status: 502, body: "<html>Bad gateway</html>" }]);
    expect((await failure(html.graph.getLead("90001", "t"))).reason).toBe("unavailable");
  });

  it("refuses a body of another shape as unavailable", async () => {
    const { graph } = graphWith([{ data: "nope" }, { id: 5 }]);
    expect((await failure(graph.listForms("1", "t"))).reason).toBe("unavailable");
    expect((await failure(graph.getLead("90001", "t"))).reason).toBe("unavailable");
  });

  it("retries a network error once, and keeps neither its message nor the address", async () => {
    const { fake, graph } = graphWith([
      new TypeError("fetch failed: https://graph.facebook.com/x?access_token=LEAK"),
      recorded("lead"),
    ]);
    expect((await graph.getLead("90001", "EAAB-page-1")).id).toBe("90001");
    expect(fake.seen).toHaveLength(2);
    const down = graphWith([new TypeError("socket LEAK"), new TypeError("socket LEAK again")]);
    const error = await failure(down.graph.getLead("90001", "EAAB-page-1"));
    expect(error.reason).toBe("unavailable");
    expect(error.message).not.toContain("LEAK");
    expect(down.fake.seen).toHaveLength(2);
  });

  it("does not retry Meta's own answer", async () => {
    const { fake, graph } = graphWith([{ status: 500, body: recorded("error-unavailable") }, recorded("lead")]);
    await failure(graph.getLead("90001", "t"));
    expect(fake.seen).toHaveLength(1);
  });
});

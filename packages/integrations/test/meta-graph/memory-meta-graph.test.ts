// The in-memory Graph answers as Meta does: tokens are Page-bound, leads are filtered by time and paged, and faults play on demand.
import { describe, expect, it } from "vitest";
import { createMemoryMetaGraph, MetaGraphError } from "../../src/meta-graph/index.js";

const questions = [
  { key: "full_name", type: "full_name", label: "Full name" },
  { key: "phone_number", type: "phone", label: "Phone" },
] as const;

function world() {
  const graph = createMemoryMetaGraph({ now: new Date("2026-10-23T10:00:00Z") });
  graph.addLogin("code-1", {
    userId: "user-1",
    pages: [
      { id: "page-1", name: "Yatra Hikes", token: "page-token-1", canAdvertise: true },
      { id: "page-2", name: "Other", token: "page-token-2", canAdvertise: false },
    ],
  });
  graph.addForm("page-1", { id: "form-1", name: "Winter ad", questions: [...questions] });
  return graph;
}

describe("the memory Meta Graph", () => {
  it("exchanges a known code, lists the Pages the person shared, and refuses an unknown code", async () => {
    const graph = world();
    const login = await graph.exchangeLoginCode("code-1", "https://web/callback");
    expect(login.userId).toBe("user-1");
    expect((await graph.listPages(login.userToken)).map((page) => page.id)).toEqual(["page-1", "page-2"]);
    await expect(graph.exchangeLoginCode("nope", "https://web/callback")).rejects.toMatchObject({
      reason: "token_invalid",
    });
  });

  it("subscribes and unsubscribes a Page with its own token only", async () => {
    const graph = world();
    await graph.subscribePage("page-1", "page-token-1");
    expect(await graph.pageIsSubscribed("page-1", "page-token-1")).toBe(true);
    await expect(graph.subscribePage("page-1", "page-token-2")).rejects.toMatchObject({ reason: "permission" });
    await graph.unsubscribePage("page-1", "page-token-1");
    expect(graph.subscribedPages.has("page-1")).toBe(false);
  });

  it("lists forms and describes their questions, and hides another Page's form", async () => {
    const graph = world();
    expect((await graph.listForms("page-1", "page-token-1")).items).toEqual([
      { id: "form-1", name: "Winter ad", status: "ACTIVE" },
    ]);
    expect((await graph.describeForm("form-1", "page-token-1")).questions).toHaveLength(2);
    await expect(graph.describeForm("form-1", "page-token-2")).rejects.toMatchObject({ reason: "not_found" });
  });

  it("reads one lead, and lists a form's leads after a time, oldest first, in pages", async () => {
    const graph = world();
    for (const [index, id] of ["a", "b", "c"].entries()) {
      graph.addLead({
        id,
        formId: "form-1",
        answers: { full_name: [id] },
        createdAt: new Date(Date.UTC(2026, 9, 23, 10, index)),
      });
    }
    expect((await graph.getLead("b", "page-token-1")).answers).toEqual({ full_name: ["b"] });
    const first = await graph.listLeads("form-1", "page-token-1", { limit: 2 });
    expect(first.items.map((lead) => lead.id)).toEqual(["a", "b"]);
    const second = await graph.listLeads("form-1", "page-token-1", { limit: 2, after: first.next ?? "" });
    expect(second.items.map((lead) => lead.id)).toEqual(["c"]);
    expect(second.next).toBeNull();
    const since = Math.floor(Date.UTC(2026, 9, 23, 10, 0) / 1000);
    expect((await graph.listLeads("form-1", "page-token-1", { since })).items.map((lead) => lead.id)).toEqual([
      "b",
      "c",
    ]);
    await expect(graph.getLead("missing", "page-token-1")).rejects.toMatchObject({ reason: "not_found" });
  });

  it("fails every call of an expired token with 190, until restored", async () => {
    const graph = world();
    graph.expireToken("page-token-1");
    await expect(graph.listForms("page-1", "page-token-1")).rejects.toMatchObject({
      reason: "token_invalid",
      code: 190,
    });
    graph.restoreToken("page-token-1");
    await expect(graph.listForms("page-1", "page-token-1")).resolves.toBeDefined();
  });

  it("plays scripted failures and a rate limit, and counts calls", async () => {
    const graph = world();
    graph.failNext("unavailable", { times: 2 });
    await expect(graph.listForms("page-1", "page-token-1")).rejects.toBeInstanceOf(MetaGraphError);
    await expect(graph.listForms("page-1", "page-token-1")).rejects.toMatchObject({ reason: "unavailable" });
    await expect(graph.listForms("page-1", "page-token-1")).resolves.toBeDefined();
    graph.rateLimit("page-1", 1);
    await graph.listForms("page-1", "page-token-1");
    await expect(graph.listForms("page-1", "page-token-1")).rejects.toMatchObject({
      reason: "rate_limited",
      code: 80005,
    });
    expect(graph.calls.byMethod.listForms).toBe(5);
  });

  it("throws a raw error as it is, so a test can make a failure that names a token", async () => {
    const graph = world();
    graph.throwNext(new Error("GET https://graph.facebook.com/x?access_token=SECRET failed"));
    await expect(graph.listForms("page-1", "page-token-1")).rejects.toThrow("SECRET");
  });

  it("makes one test lead per form", async () => {
    const graph = world();
    const id = await graph.createTestLead("form-1", "page-token-1");
    expect((await graph.getLead(id, "page-token-1")).isTest).toBe(true);
    await expect(graph.createTestLead("form-1", "page-token-1")).rejects.toBeInstanceOf(MetaGraphError);
  });
});

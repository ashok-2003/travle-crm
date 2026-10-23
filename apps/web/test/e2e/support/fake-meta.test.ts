// The journeys' fake Meta, read by the real adapter exactly as the api and the worker read it: a login and its Pages, a
// form's questions, a lead and a form's recent leads, the webhook subscription, and each refusal as its reason.
import { createRealMetaGraph, MetaGraphError } from "@travel-crm/integrations/meta-graph";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { META_E2E, startFakeMeta, type FakeMeta } from "./fake-meta";

let fake: FakeMeta;
let graph: ReturnType<typeof createRealMetaGraph>;

beforeAll(async () => {
  fake = await startFakeMeta();
  graph = createRealMetaGraph({ appId: META_E2E.appId, appSecret: META_E2E.appSecret, baseUrl: fake.url });
});

afterAll(async () => {
  await fake.stop();
});

const pageToken = "page-token-one";

async function aPageWithAForm(code: string, pageId: string, formId: string) {
  await fake.client.addLogin(code, {
    userId: `user-${code}`,
    pages: [
      { id: pageId, name: "Rajasthan Holidays", token: `${pageToken}-${pageId}`, canAdvertise: true },
      { id: `${pageId}9`, name: "A Page without Advertise", token: `other-${pageId}`, canAdvertise: false },
    ],
  });
  await fake.client.addForm(pageId, {
    id: formId,
    name: "Winter ad",
    questions: [
      { key: "full_name", type: "full_name", label: "Full name" },
      { key: "phone_number", type: "phone", label: "Phone number" },
      { key: "where_to", type: "custom", label: "Where do you want to go?" },
    ],
  });
}

describe("the fake Meta", () => {
  it("logs in with a code and lists the Pages shared, with whether the person may advertise on each", async () => {
    await aPageWithAForm("code-a", "1001", "2001");
    const login = await graph.exchangeLoginCode("code-a", "https://app.example/settings/lead-sources/meta/callback");
    expect(login.userId).toBe("user-code-a");
    const pages = await graph.listPages(login.userToken);
    expect(pages.map(({ id, name, canAdvertise }) => ({ id, name, canAdvertise }))).toEqual([
      { id: "1001", name: "Rajasthan Holidays", canAdvertise: true },
      { id: "10019", name: "A Page without Advertise", canAdvertise: false },
    ]);
    await expect(graph.exchangeLoginCode("no-such-code", "x")).rejects.toBeInstanceOf(MetaGraphError);
  });

  it("subscribes and unsubscribes a Page, and says whether it is subscribed", async () => {
    await aPageWithAForm("code-b", "1002", "2002");
    const token = `${pageToken}-1002`;
    expect(await graph.pageIsSubscribed("1002", token)).toBe(false);
    await graph.subscribePage("1002", token);
    expect(await graph.pageIsSubscribed("1002", token)).toBe(true);
    expect(await fake.client.subscribedPages()).toContain("1002");
    await graph.unsubscribePage("1002", token);
    expect(await fake.client.subscribedPages()).not.toContain("1002");
  });

  it("lists a Page's forms, describes one with its questions and reads its leads, newest after a time", async () => {
    await aPageWithAForm("code-c", "1003", "2003");
    const token = `${pageToken}-1003`;
    expect((await graph.listForms("1003", token)).items).toEqual([{ id: "2003", name: "Winter ad", status: "ACTIVE" }]);
    const described = await graph.describeForm("2003", token);
    expect(described.questions).toEqual([
      { key: "full_name", type: "full_name", label: "Full name" },
      { key: "phone_number", type: "phone", label: "Phone number" },
      { key: "where_to", type: "custom", label: "Where do you want to go?" },
    ]);
    const old = new Date(Date.now() - 3 * 86_400_000);
    await fake.client.addLead({
      id: "3001",
      formId: "2003",
      answers: { full_name: ["Old Lead"], phone_number: ["+919800000001"] },
      createdAt: old,
    });
    await fake.client.addLead({
      id: "3002",
      formId: "2003",
      platform: "instagram",
      answers: { full_name: ["New Lead"], phone_number: ["+919800000002"], where_to: ["Jaipur"] },
    });
    const all = await graph.listLeads("2003", token, {});
    expect(all.items.map((lead) => lead.id)).toEqual(["3001", "3002"]);
    const recent = await graph.listLeads("2003", token, { since: Math.floor(old.getTime() / 1000) + 60 });
    expect(recent.items.map((lead) => lead.id)).toEqual(["3002"]);
    const lead = await graph.getLead("3002", token);
    expect(lead).toMatchObject({ formId: "2003", platform: "instagram" });
    expect(lead.answers.where_to).toEqual(["Jaipur"]);
  });

  it("answers an expired token as Meta's 190, a failure by its reason, and a lead of another Page as not found", async () => {
    await aPageWithAForm("code-d", "1004", "2004");
    const token = `${pageToken}-1004`;
    await fake.client.expireToken(token);
    await expect(graph.listForms("1004", token)).rejects.toMatchObject({ reason: "token_invalid", code: 190 });
    await fake.client.restoreToken(token);
    await fake.client.failNext("rate_limited");
    await expect(graph.listForms("1004", token)).rejects.toMatchObject({ reason: "rate_limited" });
    expect((await graph.listForms("1004", token)).items).toHaveLength(1);
    await expect(graph.getLead("no-such-lead", token)).rejects.toBeInstanceOf(MetaGraphError);
  });
});

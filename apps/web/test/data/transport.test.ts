// Every call the web app makes is a JSON POST, queries included: as a GET a query's input (a customer's phone, email
// or a searched name) would sit in the URL, and so in access logs no erasure reaches. The api's and the console's
// clients alike.
import { initTRPC } from "@trpc/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createConsoleClient } from "@/console/data/console-trpc";
import { createApiClient } from "@/data/trpc";
import { stubApi } from "./support/fake-api";

const t = initTRPC.create();
const anyInput = z.looseObject({});
const router = t.router({
  leads: t.router({
    knownContact: t.procedure.input(anyInput).query(() => null),
    list: t.procedure.input(anyInput).query(() => null),
  }),
  organizations: t.router({ get: t.procedure.input(anyInput).query(() => null) }),
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the tRPC clients", () => {
  it("send a query with personal data as a JSON POST, with no input in the URL", async () => {
    const sent = stubApi(router, "/api/trpc");
    const contacts = { phone: "98765 43210", email: "rahul@example.in", instagramHandle: "rahul.s" };
    await createApiClient().leads.knownContact.query(contacts);
    await createApiClient().leads.list.query({ search: "Rahul Shrma" });
    expect(sent.map(({ method, url }) => [method, url])).toEqual([
      ["POST", "/api/trpc/leads.knownContact?batch=1"],
      ["POST", "/api/trpc/leads.list?batch=1"],
    ]);
    for (const call of sent) {
      expect(call.url).not.toMatch(/input|98765|rahul|Shrma/i);
      expect(call.contentType).toBe("application/json");
    }
    expect(sent.map((call) => call.body)).toEqual([{ 0: contacts }, { 0: { search: "Rahul Shrma" } }]);
  });

  it("post the console's queries too", async () => {
    const sent = stubApi(router, "/api/platform/trpc");
    const organizationId = "0199e7a0-0000-7000-8000-0000000000c1";
    await createConsoleClient().organizations.get.query({ organizationId });
    expect(sent).toEqual([
      {
        url: "/api/platform/trpc/organizations.get?batch=1",
        method: "POST",
        contentType: "application/json",
        streamHeader: "application/jsonl",
        body: { 0: { organizationId } },
      },
    ]);
  });
});

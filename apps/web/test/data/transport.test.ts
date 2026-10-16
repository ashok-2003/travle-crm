// Every call the web app makes is a JSON POST, queries included: as a GET a query's input (a customer's phone, email
// or a searched name) would sit in the URL, and so in access logs no erasure reaches. The api's and the console's
// clients alike.
import { afterEach, describe, expect, it, vi } from "vitest";
import { createConsoleClient } from "@/console/data/console-trpc";
import { createApiClient } from "@/data/trpc";

interface Sent {
  url: string;
  method: string;
  contentType: string | null;
  body: unknown;
}

/** Records what each call sends, and answers every call of a batch with no data. */
function recordCalls(): Sent[] {
  const sent: Sent[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      sent.push({
        url,
        method: init?.method ?? "GET",
        contentType: new Headers(init?.headers).get("content-type"),
        body: typeof init?.body === "string" ? JSON.parse(init.body) : null,
      });
      return Promise.resolve(Response.json([{ result: { data: null } }]));
    }),
  );
  return sent;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the tRPC clients", () => {
  it("send a query with personal data as a JSON POST, with no input in the URL", async () => {
    const sent = recordCalls();
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
    const sent = recordCalls();
    const organizationId = "0199e7a0-0000-7000-8000-0000000000c1";
    await createConsoleClient().organizations.get.query({ organizationId });
    expect(sent).toEqual([
      {
        url: "/api/platform/trpc/organizations.get?batch=1",
        method: "POST",
        contentType: "application/json",
        body: { 0: { organizationId } },
      },
    ]);
  });
});

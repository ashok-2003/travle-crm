// The public pricing page's plans (spec 7.2: plans are data): every plan on sale, cheapest first, with only what a
// visitor may see; never the demo's own plan or an archived one. Anyone may ask, without signing in.
import { randomUUID } from "node:crypto";
import { publicPlans } from "@travel-crm/contracts/subscriptions";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestServer, type TestServer } from "./support/test-server.js";

describe("GET /api/public/plans", () => {
  let server: TestServer;

  beforeAll(() => {
    server = createTestServer();
  });

  afterAll(async () => {
    await server.close();
  });

  /** A plan with a key of its own, so plans other tests make don't get in the way. */
  async function plan(name: string, fields: { monthly: number | null; forSale?: boolean; archived?: boolean }) {
    const key = `public-${randomUUID().slice(0, 8)}`;
    await server.platform.plan.create({
      data: {
        key,
        name,
        monthlyPricePaise: fields.monthly,
        yearlyPricePaise: fields.monthly === null ? 1_200_000_00 : fields.monthly * 10,
        seatLimit: 5,
        whatsappNumberLimit: 1,
        storageLimitBytes: 5_000_000_000n,
        modules: ["crm", "inbox"],
        forSale: fields.forSale ?? true,
        archivedAt: fields.archived ? new Date() : null,
      },
    });
    return key;
  }

  it("lists the plans on sale, cheapest first, with only their public facts", async () => {
    const dearer = await plan("Dearer", { monthly: 4_999_00 });
    const cheaper = await plan("Cheaper", { monthly: 1_999_00 });
    const yearlyOnly = await plan("Yearly only", { monthly: null });
    const demo = await plan("Not for sale", { monthly: 0, forSale: false });
    const archived = await plan("Archived", { monthly: 999_00, archived: true });

    const response = await server.app.request("/api/public/plans", { headers: { "x-forwarded-for": "198.51.100.7" } });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=300");
    const body: unknown = await response.json();
    const plans = publicPlans.parse(body);
    const keys = plans.map((listed) => listed.key);
    expect(keys).not.toContain(demo);
    expect(keys).not.toContain(archived);
    const ours = keys.filter((key) => [dearer, cheaper, yearlyOnly].includes(key));
    expect(ours).toEqual([cheaper, dearer, yearlyOnly]);
    expect(Object.keys((body as Record<string, unknown>[])[0] ?? {}).sort()).toEqual(
      Object.keys(publicPlans.element.shape).sort(),
    );
  });
});

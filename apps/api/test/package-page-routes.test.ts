// An agency's public package pages over HTTP (release 7b): the page of packages and one package's page hold only what the
// agency published, are cacheable for a minute and are "not available" (404, one answer) for anything else; an enquiry from
// one becomes a lead from the page, is answered alike whatever became of it, and meets the form's traps and limits.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ORIGIN, createTestAgency, createTestServer, type TestAgency, type TestServer } from "./support/test-server.js";
import { countingLimiter, freshAddress, freshPhone, openedTokenFor } from "./support/website-form.js";

describe("an agency's public package pages", () => {
  let server: TestServer;
  let agency: TestAgency;
  let code: string;
  const limiter = countingLimiter();

  beforeAll(async () => {
    server = createTestServer({}, { rateLimiter: limiter });
    agency = await createTestAgency(server);
    code = agency.code.toLowerCase();
    await server.db.forOrg(agency.organizationId, async (tx) => {
      await tx.publicPageSettings.create({ data: { enabled: true, about: "Yatras since 2009.", instagramUrl: "" } });
      const destination = await tx.destination.create({ data: { name: "Kedarnath" }, select: { id: true } });
      await tx.quoteTemplate.create({
        data: {
          name: "Kedarnath yatra",
          title: "Kedarnath yatra",
          slug: "kedarnath-yatra",
          summary: "Five days to Kedarnath.",
          nights: 5,
          highlights: ["Darshan"],
          destinationId: destination.id,
          priceDisplay: "from",
          fromPricePaise: 3_200_000n,
          published: true,
          // What must never be on a page: a tier priced from a rate, the items' costs.
          items: [{ description: "Hotel", detail: "", quantity: 5, unitPricePaise: 400_000, costUnitPaise: 350_000 }],
        },
      });
      await tx.quoteTemplate.create({
        data: { name: "Draft trip", title: "Draft trip", slug: "draft-trip", summary: "Not yet.", published: false },
      });
    });
  });
  afterAll(async () => {
    await server.close();
  });

  const get = (path: string, address: string | null = freshAddress()) =>
    server.app.request(`/api/public/packages/${path}`, {
      headers: address === null ? {} : { "x-forwarded-for": address },
    });
  const post = (slug: string, body: unknown, headers: Record<string, string> = {}) =>
    server.app.request(`/api/public/packages/${code}/${slug}/enquiries`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN, "x-forwarded-for": freshAddress(), ...headers },
      body: JSON.stringify(body),
    });
  const enquiry = (overrides: Record<string, unknown> = {}) => ({
    submissionId: randomUUID(),
    openedToken: openedTokenFor(agency.organizationId),
    homepage: "",
    answers: { name: "Meera Iyer", phone: freshPhone(), travellers: 3 },
    ...overrides,
  });
  const leadsOf = (phone: string) =>
    server.db.forOrg(agency.organizationId, (tx) => tx.lead.findMany({ where: { person: { phoneE164: phone } } }));

  describe("what a visitor reads", () => {
    it("is the published package, cacheable for a minute, and nothing that is the agency's own", async () => {
      const response = await get(`${code}/kedarnath-yatra`);
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("public, s-maxage=60");
      for (const [name] of response.headers) expect(name).not.toMatch(/^access-control-/);
      const text = await response.text();
      expect(text).not.toContain("costUnitPaise");
      expect(text).not.toContain("350000");
      expect(text).not.toContain("seatsTotal");
      const body = JSON.parse(text) as {
        available: boolean;
        page: {
          agency: { name: string; code: string };
          package: { name: string; fromPricePaise: number; destinationName: string };
          form: { openedToken: string; consentLine: string };
        };
      };
      expect(body.available).toBe(true);
      expect(body.page.agency.code).toBe(code);
      expect(body.page.package).toMatchObject({
        name: "Kedarnath yatra",
        fromPricePaise: 3_200_000,
        destinationName: "Kedarnath",
      });
      expect(body.page.form.openedToken).toContain(".");
      expect(body.page.form.consentLine).toContain(body.page.agency.name);
    });

    it("lists the agency's published packages, not its drafts", async () => {
      const response = await get(code);
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        page: { packages: { slug: string }[]; destinations: { name: string }[] };
      };
      expect(body.page.packages.map((one) => one.slug)).toEqual(["kedarnath-yatra"]);
      expect(body.page.destinations.map((one) => one.name)).toEqual(["Kedarnath"]);
    });

    it("answers a page that is not there with one plain 404: unpublished, unknown, malformed, or another agency's", async () => {
      const gone = [
        `${code}/draft-trip`,
        `${code}/no-such-trip`,
        `ZZZZZZ/kedarnath-yatra`,
        `${code}/Bad_Slug`,
        "x/kedarnath-yatra",
      ];
      const answers = await Promise.all(
        gone.map(async (path) => {
          const response = await get(path);
          return { status: response.status, body: await response.text(), cache: response.headers.get("cache-control") };
        }),
      );
      for (const answer of answers)
        expect(answer).toEqual({ status: 404, body: '{"available":false}', cache: "no-store" });
    });

    it("counts the visit against the agency's page limits, by the agency's code", async () => {
      await get(`${code}/kedarnath-yatra`);
      expect(limiter.keys.some((key) => key === `form-view-agency:pkg:${code}`)).toBe(true);
    });

    it("is nothing while the agency's pages are off or its subscription is read only", async () => {
      const quiet = await createTestAgency(server);
      await server.db.forOrg(quiet.organizationId, async (tx) => {
        await tx.publicPageSettings.create({ data: { enabled: false } });
        await tx.quoteTemplate.create({
          data: { name: "Trip", title: "Trip", slug: "trip", summary: "x", published: true },
        });
      });
      const path = `${quiet.code.toLowerCase()}/trip`;
      expect((await get(path)).status).toBe(404);
      await server.db.forOrg(quiet.organizationId, (tx) =>
        tx.publicPageSettings.updateMany({ data: { enabled: true } }),
      );
      expect((await get(path)).status).toBe(200);
      await server.platform.subscription.update({
        where: { organizationId: quiet.organizationId },
        data: { status: "read_only", statusChangedAt: new Date() },
      });
      expect((await get(path)).status).toBe(404);
      expect((await get(quiet.code.toLowerCase())).status).toBe(404);
    });
  });

  describe("an enquiry", () => {
    it("makes a lead from the page, answered with the one answer", async () => {
      const body = enquiry();
      const response = await post("kedarnath-yatra", body);
      expect(response.status).toBe(201);
      expect(await response.json()).toEqual({ ok: true });
      const [lead] = await leadsOf(body.answers.phone);
      expect(lead).toMatchObject({ source: "package_page", sourceDetail: "Kedarnath yatra", stage: "new" });
    });

    it("saves a submission id once, and a filled trap nothing", async () => {
      const body = enquiry();
      await post("kedarnath-yatra", body);
      await post("kedarnath-yatra", body);
      expect(await leadsOf(body.answers.phone)).toHaveLength(1);
      const bot = enquiry({ homepage: "http://spam.test" });
      const answer = await post("kedarnath-yatra", bot);
      expect(answer.status).toBe(201);
      expect(await leadsOf(bot.answers.phone)).toHaveLength(0);
    });

    it("refuses a page opened a moment ago, an old or forged token, and a package that is not there", async () => {
      const reason = async (response: Response) => ((await response.json()) as { reason: string }).reason;
      expect(
        await reason(
          await post("kedarnath-yatra", enquiry({ openedToken: openedTokenFor(agency.organizationId, 500) })),
        ),
      ).toBe("FORM_TOO_FAST");
      expect(
        await reason(
          await post(
            "kedarnath-yatra",
            enquiry({ openedToken: openedTokenFor(agency.organizationId, 25 * 3_600_000) }),
          ),
        ),
      ).toBe("FORM_EXPIRED");
      expect(await reason(await post("kedarnath-yatra", enquiry({ openedToken: openedTokenFor(randomUUID()) })))).toBe(
        "FORM_EXPIRED",
      );
      const missing = await post("draft-trip", enquiry());
      expect(missing.status).toBe(404);
      expect(await reason(missing)).toBe("PAGE_UNAVAILABLE");
    });

    it("holds the website form's shape rules: JSON from the web app's origin, a strict body", async () => {
      expect((await post("kedarnath-yatra", enquiry(), { origin: "http://evil.example" })).status).toBe(403);
      expect((await post("kedarnath-yatra", enquiry(), { "content-type": "text/plain" })).status).toBe(415);
      expect((await post("kedarnath-yatra", { ...enquiry(), extra: 1 })).status).toBe(400);
      expect((await post("kedarnath-yatra", enquiry({ answers: { name: "A", phone: "123" } }))).status).toBe(400);
    });

    it("answers an unknown agency as a page that is not there", async () => {
      const response = await server.app.request("/api/public/packages/ZZZZZZ/kedarnath-yatra/enquiries", {
        method: "POST",
        headers: { "content-type": "application/json", origin: ORIGIN, "x-forwarded-for": freshAddress() },
        body: JSON.stringify(enquiry()),
      });
      expect(response.status).toBe(404);
    });
  });
});

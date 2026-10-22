// The website form's public page and the address check (spec 5.1, 6.2, 6.3): what a visitor's page gets, and that every
// closed state looks alike.
import { websiteFormPublic } from "@travel-crm/contracts/website-forms";
import {
  checkOpenedToken,
  formTokenKey,
  saveWebsiteForm,
  setWebsiteFormEnabled,
} from "@travel-crm/domain/website-forms";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ownerAccess } from "./support/people.js";
import { createTestServer, testAuthSettings, type TestServer } from "./support/test-server.js";
import {
  agencyWithOpenForm,
  countingLimiter,
  freshAddress,
  getForm,
  planWithoutCrm,
  type OpenForm,
} from "./support/website-form.js";

describe("the public website form page", () => {
  let server: TestServer;
  let open: OpenForm;

  beforeAll(async () => {
    server = createTestServer();
    open = await agencyWithOpenForm(server);
  });
  afterAll(async () => {
    await server.close();
  });

  it("returns the form, the destinations and a signed token, with no-store", async () => {
    await server.db.forOrg(open.agency.organizationId, (tx) => tx.destination.createMany({ data: [{ name: "Goa" }] }));
    const response = await getForm(server, open.key);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = websiteFormPublic.parse(await response.json());
    if (!body.available) throw new Error("the form should be open");
    expect(body.form.organizationName).toBe("Test agency");
    expect(body.form.destinations.map((destination) => destination.name)).toContain("Goa");
    expect(body.form.months).toHaveLength(12);
    expect(body.form.turnstileSiteKey).toBeNull();
    // The token is this form's, and a person who waits a moment is let through.
    expect(() => {
      checkOpenedToken(
        formTokenKey(testAuthSettings.secret),
        body.form.openedToken,
        open.formId,
        new Date(Date.now() + 5000),
      );
    }).not.toThrow();
  });

  it("answers a closed form (off, read-only, suspended, a plan without crm) with available false and one body", async () => {
    const closed = await agencyWithOpenForm(server);
    const { organizationId } = closed.agency;
    const bodies: string[] = [];
    const record = async () => {
      const response = await getForm(server, closed.key);
      expect(response.status).toBe(200);
      bodies.push(JSON.stringify(await response.json()));
    };
    const setSubscription = (data: Record<string, unknown>) =>
      server.platform.subscription.update({ where: { organizationId }, data });
    const actor = await ownerAccess(server, closed.agency);
    await server.db.forOrg(organizationId, (tx) =>
      saveWebsiteForm(tx, actor, {
        allowEmbed: true,
        emailMode: "optional",
        destinationMode: "optional",
        travelMonthMode: "optional",
        travellersMode: "optional",
        budgetMode: "off",
        messageMode: "optional",
        offersTickbox: false,
        heading: null,
        introduction: null,
        thankYouMessage: null,
        websiteUrl: "https://sharma.example.in",
        websiteButtonText: "Our site",
        privacyUrl: null,
      }),
    );
    await server.db.forOrg(organizationId, (tx) => setWebsiteFormEnabled(tx, actor, false));
    await record(); // the switch is off
    await server.db.forOrg(organizationId, (tx) => setWebsiteFormEnabled(tx, actor, true));
    await setSubscription({ status: "read_only", statusChangedAt: new Date() });
    await record();
    await setSubscription({ status: "suspended", statusChangedAt: new Date() });
    await record();
    await setSubscription({ status: "active", statusChangedAt: new Date(), planId: await planWithoutCrm(server) });
    await record();
    expect(new Set(bodies).size).toBe(1);
    expect(JSON.parse(bodies[0] ?? "")).toEqual({
      available: false,
      form: {
        organizationName: "Test agency",
        logoUrl: null,
        websiteUrl: "https://sharma.example.in",
        websiteButtonText: "Our site",
      },
    });
  });

  it("answers a wrong secret with 404 FORM_NOT_FOUND", async () => {
    const wrong = `${open.key.slice(0, 22)}${"A".repeat(16)}`;
    const response = await getForm(server, wrong);
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: "NOT_FOUND", reason: "FORM_NOT_FOUND" });
  });

  it("holds no owner name, email or id", async () => {
    const text = JSON.stringify(await (await getForm(server, open.key)).json());
    for (const secret of [
      open.agency.owner.email,
      "Asha Owner",
      open.agency.owner.userId,
      open.agency.organizationId,
    ]) {
      expect(text).not.toContain(secret);
    }
  });

  it("never offers the tickbox while the consent switch is off", async () => {
    const actor = await ownerAccess(server, open.agency);
    await server.db.forOrg(open.agency.organizationId, (tx) =>
      saveWebsiteForm(tx, actor, {
        allowEmbed: true,
        emailMode: "optional",
        destinationMode: "optional",
        travelMonthMode: "optional",
        travellersMode: "optional",
        budgetMode: "off",
        messageMode: "optional",
        offersTickbox: true,
        heading: null,
        introduction: null,
        thankYouMessage: null,
        websiteUrl: null,
        websiteButtonText: null,
        privacyUrl: null,
      }),
    );
    const body = websiteFormPublic.parse(await (await getForm(server, open.key)).json());
    if (!body.available) throw new Error("the form should be open");
    expect(body.form.offersTickbox).toBe(false);
    expect(body.form.offersWording).toBeNull();
  });
});

describe("the public page's limits and malformed keys", () => {
  it("answers a malformed key with 404 before any limit or database is touched", async () => {
    const server = createTestServer(
      {},
      { rateLimiter: { hit: () => Promise.reject(new Error("the limiter must not be asked")) } },
    );
    try {
      const response = await getForm(server, "not-a-key");
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ reason: "FORM_NOT_FOUND" });
    } finally {
      await server.close();
    }
  });

  it("refuses the 61st view in a minute from one address with 429 and Retry-After", async () => {
    const limiter = countingLimiter();
    const server = createTestServer({}, { rateLimiter: limiter });
    try {
      const open = await agencyWithOpenForm(server);
      const address = freshAddress();
      // Cheap calls to the same bucket: the page itself is tested above.
      for (let call = 0; call < 60; call += 1) expect((await getForm(server, open.key, address)).status).toBe(200);
      const refused = await getForm(server, open.key, address);
      expect(refused.status).toBe(429);
      expect(Number(refused.headers.get("retry-after"))).toBeGreaterThan(0);
      expect(await refused.json()).toMatchObject({ code: "RATE_LIMITED" });
      // Another address is not held up by it.
      expect((await getForm(server, open.key, freshAddress())).status).toBe(200);
    } finally {
      await server.close();
    }
  }, 120_000);

  it("skips the address bucket when no address can be read", async () => {
    const limiter = countingLimiter();
    const server = createTestServer({}, { rateLimiter: limiter });
    try {
      const open = await agencyWithOpenForm(server);
      expect((await getForm(server, open.key, null)).status).toBe(200);
      expect(limiter.keys.filter((key) => key.startsWith("form-view"))).toEqual([]);
    } finally {
      await server.close();
    }
  });
});

describe("the address page", () => {
  it("shows the counted address, the entries and the hops, and is limited", async () => {
    const limiter = countingLimiter();
    const server = createTestServer(
      {},
      { rateLimiter: limiter, formAddress: { headerNames: ["x-forwarded-for"], trustedProxies: [], proxyHops: 1 } },
    );
    try {
      const address = freshAddress();
      const call = () =>
        server.app.request("/api/public/client-address", {
          headers: { "x-forwarded-for": `${address}, 10.0.0.1`, cookie: "session=secret" },
        });
      const first = await call();
      expect(first.status).toBe(200);
      expect(await first.json()).toEqual({ address, entries: 2, hops: 1 });
      for (let call2 = 1; call2 < 20; call2 += 1) expect((await call()).status).toBe(200);
      expect((await call()).status).toBe(429);
    } finally {
      await server.close();
    }
  });
});

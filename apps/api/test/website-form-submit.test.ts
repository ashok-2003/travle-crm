// A visitor's enquiry over HTTP (spec 6): it becomes a lead, every outcome is answered alike, the traps and limits hold,
// and nothing a visitor typed reaches a log line.
import { randomUUID } from "node:crypto";
import { addBlockedContact } from "@travel-crm/domain/crm";
import { createMemoryBotCheck } from "@travel-crm/integrations/bot-check";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ownerAccess } from "./support/people.js";
import { createTestServer, type TestServer } from "./support/test-server.js";
import {
  agencyWithOpenForm,
  enquiryFor,
  freshAddress,
  freshPhone,
  openedTokenFor,
  postEnquiry,
  type OpenForm,
} from "./support/website-form.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("a website enquiry", () => {
  let server: TestServer;
  let open: OpenForm;

  beforeAll(async () => {
    server = createTestServer();
    open = await agencyWithOpenForm(server);
  });
  afterAll(async () => {
    await server.close();
  });

  const inAgency = <T>(agency: OpenForm, work: Parameters<typeof server.db.forOrg<T>>[1]) =>
    server.db.forOrg(agency.agency.organizationId, work);
  const leadsOf = (agency: OpenForm, phone: string) =>
    inAgency(agency, (tx) => tx.lead.findMany({ where: { person: { phoneE164: phone } }, include: { person: true } }));
  const reasonOf = async (response: Response) => ((await response.json()) as { reason: string }).reason;

  it("makes a lead from the web form, owned by the Owner, and tells the Owner", async () => {
    const phone = freshPhone();
    const response = await postEnquiry(
      server,
      open.key,
      enquiryFor(open.formId, { answers: { name: "Meera Iyer", phone, message: "Goa in December" } }),
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true });
    const [lead] = await leadsOf(open, phone);
    expect(lead).toMatchObject({ source: "web_form", ownerUserId: open.agency.owner.userId, stage: "new" });
    const notices = await inAgency(open, (tx) =>
      tx.notification.count({ where: { recipientUserId: open.agency.owner.userId, link: `/leads/${lead?.id ?? ""}` } }),
    );
    expect(notices).toBeGreaterThan(0);
  });

  it("answers every non-refusal outcome with the same status, headers and body", async () => {
    const phone = freshPhone();
    const blockedPhone = freshPhone();
    const actor = await ownerAccess(server, open.agency);
    await inAgency(open, (tx) => addBlockedContact(tx, actor, { kind: "phone", value: blockedPhone }));
    const sameId = randomUUID();
    const answers = { name: "Same Person", phone };
    const sends: Response[] = [];
    // New, repeat (same phone, another id), a copy of the first id, a blocked contact, and a honeypot.
    sends.push(await postEnquiry(server, open.key, enquiryFor(open.formId, { submissionId: sameId, answers })));
    sends.push(await postEnquiry(server, open.key, enquiryFor(open.formId, { answers })));
    sends.push(await postEnquiry(server, open.key, enquiryFor(open.formId, { submissionId: sameId, answers })));
    sends.push(
      await postEnquiry(
        server,
        open.key,
        enquiryFor(open.formId, { answers: { name: "Blocked", phone: blockedPhone } }),
      ),
    );
    sends.push(await postEnquiry(server, open.key, enquiryFor(open.formId, { answers, homepage: "http://spam.test" })));
    // The fourth in a day from one person: the earlier sends made two leads and a repeat; add enough for the cap.
    sends.push(await postEnquiry(server, open.key, enquiryFor(open.formId, { answers })));
    sends.push(await postEnquiry(server, open.key, enquiryFor(open.formId, { answers })));
    const shape = async (response: Response) => {
      const headers = [...response.headers].filter(([name]) => name !== "x-request-id");
      return JSON.stringify({ status: response.status, headers, body: await response.text() });
    };
    const shapes = await Promise.all(sends.map(shape));
    expect(new Set(shapes).size).toBe(1);
    expect(sends[0]?.status).toBe(201);
    // And the blocked one saved nothing; the others made one lead (the repeat enquiries are the same lead).
    expect(await leadsOf(open, blockedPhone)).toHaveLength(0);
    expect((await leadsOf(open, phone)).length).toBe(1);
  });

  it("drops a filled homepage with the thank-you and saves nothing", async () => {
    const phone = freshPhone();
    const response = await postEnquiry(
      server,
      open.key,
      enquiryFor(open.formId, { homepage: "x", answers: { name: "Bot", phone } }),
    );
    expect(response.status).toBe(201);
    expect(await leadsOf(open, phone)).toHaveLength(0);
    const spam = await inAgency(open, (tx) => tx.websiteFormSubmission.count({ where: { outcome: "spam" } }));
    expect(spam).toBeGreaterThan(0);
  });

  it("refuses a second-old page with FORM_TOO_FAST, then accepts the same token a moment later", async () => {
    const body = enquiryFor(open.formId, { openedToken: openedTokenFor(open.formId, 1000) });
    const first = await postEnquiry(server, open.key, body);
    expect(first.status).toBe(400);
    expect(await reasonOf(first)).toBe("FORM_TOO_FAST");
    await sleep(1100);
    expect((await postEnquiry(server, open.key, body)).status).toBe(201);
  });

  it("refuses an expired token, another form's token and a forged one with FORM_EXPIRED", async () => {
    const old = enquiryFor(open.formId, { openedToken: openedTokenFor(open.formId, 25 * 3_600_000) });
    expect(await reasonOf(await postEnquiry(server, open.key, old))).toBe("FORM_EXPIRED");
    const other = enquiryFor(open.formId, { openedToken: openedTokenFor(randomUUID()) });
    expect(await reasonOf(await postEnquiry(server, open.key, other))).toBe("FORM_EXPIRED");
    const forged = enquiryFor(open.formId, { openedToken: `${open.formId}.${String(Date.now() - 60_000)}.AAAA` });
    expect(await reasonOf(await postEnquiry(server, open.key, forged))).toBe("FORM_EXPIRED");
  });

  it("refuses three web links with their reason", async () => {
    const message = "see http://a.example.com and http://b.example.com and www.c.example.com";
    const response = await postEnquiry(
      server,
      open.key,
      enquiryFor(open.formId, { answers: { name: "Meera", phone: freshPhone(), message } }),
    );
    expect(response.status).toBe(400);
    expect(await reasonOf(response)).toBe("FORM_LINKS_NOT_ALLOWED");
  });

  it("refuses a submission when the agency went read-only after the page loaded", async () => {
    const late = await agencyWithOpenForm(server);
    const phone = freshPhone();
    // The page loaded while the form was open (the token below), then the subscription lapsed.
    const body = enquiryFor(late.formId, { answers: { name: "Late Visitor", phone } });
    await server.platform.subscription.update({
      where: { organizationId: late.agency.organizationId },
      data: { status: "read_only", statusChangedAt: new Date() },
    });
    const response = await postEnquiry(server, late.key, body);
    expect(response.status).toBe(403);
    expect(await reasonOf(response)).toBe("FORM_UNAVAILABLE");
    expect(await leadsOf(late, phone)).toHaveLength(0);
  });

  it("refuses an embedded enquiry once the agency switched embedding off, and still takes a hosted one", async () => {
    const noEmbed = await agencyWithOpenForm(server);
    await server.db.forOrg(noEmbed.agency.organizationId, (tx) =>
      tx.websiteForm.updateMany({ data: { allowEmbed: false } }),
    );
    const embedded = await postEnquiry(server, noEmbed.key, enquiryFor(noEmbed.formId, { via: "embedded" }));
    expect(embedded.status).toBe(403);
    expect(await reasonOf(embedded)).toBe("FORM_UNAVAILABLE");
    expect((await postEnquiry(server, noEmbed.key, enquiryFor(noEmbed.formId))).status).toBe(201);
  });

  it("refuses a wrong secret with 404 and a malformed key with 404", async () => {
    const wrong = `${open.key.slice(0, 22)}${"B".repeat(16)}`;
    expect((await postEnquiry(server, wrong, enquiryFor(open.formId))).status).toBe(404);
    expect((await postEnquiry(server, "nope", enquiryFor(open.formId))).status).toBe(404);
  });

  it("refuses a wrong origin with 403, a form content type with 415, a 17 KB body with 413 and an unknown key with 400", async () => {
    const body = enquiryFor(open.formId);
    const foreign = await postEnquiry(server, open.key, body, { headers: { origin: "https://evil.example" } });
    expect(foreign.status).toBe(403);
    const form = await postEnquiry(server, open.key, body, { headers: { "content-type": "text/plain" } });
    expect(form.status).toBe(415);
    const big = await postEnquiry(server, open.key, body, {
      raw: JSON.stringify({ ...body, pad: "x".repeat(17 * 1024) }),
    });
    expect(big.status).toBe(413);
    const unknown = await postEnquiry(server, open.key, { ...body, extra: 1 });
    expect(unknown.status).toBe(400);
    const notJson = await postEnquiry(server, open.key, null, { raw: "{nope" });
    expect(notJson.status).toBe(400);
  });

  it("refuses the fourth submission from one address in ten minutes, and another agency still works", async () => {
    const other = await agencyWithOpenForm(server);
    const address = freshAddress();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect((await postEnquiry(server, open.key, enquiryFor(open.formId), { address })).status).toBe(201);
    }
    const refused = await postEnquiry(server, open.key, enquiryFor(open.formId), { address });
    expect(refused.status).toBe(429);
    expect(Number(refused.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(await reasonOf(refused)).toBe("RATE_LIMITED");
    expect((await postEnquiry(server, other.key, enquiryFor(other.formId), { address })).status).toBe(201);
  });

  it("with no readable address skips the address limits, holds an agency to 20 an hour and tells the Owner once", async () => {
    const busy = await agencyWithOpenForm(server);
    // Honeypot drops count against the limit like any other attempt, and save nothing.
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const body = enquiryFor(busy.formId, { homepage: "x" });
      expect((await postEnquiry(server, busy.key, body, { address: null })).status).toBe(201);
    }
    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect((await postEnquiry(server, busy.key, enquiryFor(busy.formId), { address: null })).status).toBe(429);
    }
    const notices = await inAgency(busy, (tx) =>
      tx.notification.count({ where: { kind: "form.busy", recipientUserId: busy.agency.owner.userId } }),
    );
    expect(notices).toBe(1);
  });

  it("two racing submissions with one id make one lead", async () => {
    const phone = freshPhone();
    const body = enquiryFor(open.formId, { answers: { name: "Racer", phone } });
    const [a, b] = await Promise.all([
      postEnquiry(server, open.key, body, { address: freshAddress() }),
      postEnquiry(server, open.key, body, { address: freshAddress() }),
    ]);
    expect([a.status, b.status]).toEqual([201, 201]);
    expect(await leadsOf(open, phone)).toHaveLength(1);
  });

  it("puts nothing a visitor typed in a log line", async () => {
    const phone = freshPhone();
    server.logger.entries.length = 0;
    await postEnquiry(
      server,
      open.key,
      enquiryFor(open.formId, {
        answers: {
          name: "Unmistakable Name",
          phone,
          email: "unmistakable@example.test",
          message: "unmistakable words",
        },
      }),
    );
    await postEnquiry(
      server,
      open.key,
      enquiryFor(open.formId, { openedToken: "bad", answers: { name: "Unmistakable Name", phone } }),
    );
    const logs = JSON.stringify(server.logger.entries);
    expect(server.logger.entries.length).toBeGreaterThan(0);
    for (const secret of ["Unmistakable", "unmistakable", phone, phone.slice(3), open.key.slice(22)]) {
      expect(logs).not.toContain(secret);
    }
    expect(logs).not.toContain(open.agency.owner.email);
  });
});

describe("the bot check", () => {
  it("refuses a failed check, accepts and logs an unreachable one, and checks nothing without keys", async () => {
    const botCheck = createMemoryBotCheck();
    const withKeys = createTestServer({}, { botCheck, turnstileSiteKey: "site-key" });
    const without = createTestServer();
    try {
      const open = await agencyWithOpenForm(withKeys);
      const send = (token?: string) =>
        postEnquiry(withKeys, open.key, enquiryFor(open.formId, token === undefined ? {} : { turnstileToken: token }));
      botCheck.willAnswer("fail");
      const failed = await send("tok-1");
      expect(failed.status).toBe(400);
      expect(((await failed.json()) as { reason: string }).reason).toBe("FORM_BOT_CHECK_FAILED");
      expect(botCheck.seen().at(-1)?.token).toBe("tok-1");
      // No token at all with keys set is a failed check, without asking Cloudflare.
      const seenBefore = botCheck.seen().length;
      expect((await send()).status).toBe(400);
      expect(botCheck.seen()).toHaveLength(seenBefore);
      botCheck.willAnswer("unreachable");
      expect((await send("tok-2")).status).toBe(201);
      expect(JSON.stringify(withKeys.logger.entries)).toContain("bot check unreachable");
      botCheck.willAnswer("pass");
      expect((await send("tok-3")).status).toBe(201);
      // Without keys nothing is asked, and no token is needed.
      const plain = await agencyWithOpenForm(without);
      expect((await postEnquiry(without, plain.key, enquiryFor(plain.formId))).status).toBe(201);
    } finally {
      await withKeys.close();
      await without.close();
    }
  });
});

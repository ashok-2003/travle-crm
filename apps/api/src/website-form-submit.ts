// POST /api/public/website-forms/:key/enquiries: a visitor's enquiry, checked cheap-first (spec 6.1) and saved as a lead.
// Every outcome that is not a refusal gets the one answer (W20), so the form can't be used to learn who is a customer.
import { websiteEnquiryInput } from "@travel-crm/contracts/website-forms";
import { answerOf, receiveWebsiteEnquiry } from "@travel-crm/domain/crm";
import { isUniqueViolation } from "@travel-crm/db";
import { DomainError, publicActor } from "@travel-crm/domain/kernel";
import {
  assertFormOpen,
  assertNoLinks,
  assertNotBot,
  checkOpenedToken,
  noteFlood,
  parseFormKey,
  recordSubmission,
  type WebsiteFormRow,
} from "@travel-crm/domain/website-forms";
import { Hono } from "hono";
import { limitBody } from "./body-limit.js";
import { hitFormLimits } from "./form-limits.js";
import { requestOf, type RequestLogEnv } from "./request-log.js";
import { requireTrustedJson } from "./trusted-origin.js";
import {
  formNotFound,
  noteOrganization,
  refusal,
  tooManyTries,
  type WebsiteFormRouteDependencies,
} from "./website-form-shared.js";

/** The enquiry's size cap, in bytes: a message is at most 1,000 characters, so no honest body comes near it. */
const MAX_BODY_BYTES = 16 * 1024;

const badShape = () => new DomainError("VALIDATION", "VALIDATION", "Check your details and try again");

export function websiteFormSubmitRoute(
  dependencies: WebsiteFormRouteDependencies,
  addressOf: (request: Request) => string | null,
  tokenKey: Buffer,
  now: () => Date,
): Hono<RequestLogEnv> {
  const { db, identity, limiter, logger, botCheck } = dependencies;
  const app = new Hono<RequestLogEnv>();

  /** The flood notice goes to the Owner once an hour; a key that is wrong or a form that is closed notifies nobody. */
  async function tellOwnerOfFlood(key: string, organizationId: string): Promise<void> {
    const ownerUserId = await identity.firstOwner(organizationId);
    if (ownerUserId === null) return;
    const at = now();
    try {
      await db.forOrg(organizationId, async (tx) => {
        const form = await assertFormOpen(tx, { key, organizationId, ownerUserId, now: at });
        await noteFlood(tx, publicActor(organizationId), { formId: form.id, ownerUserId, now: at });
      });
    } catch (error) {
      if (!(error instanceof DomainError)) throw error;
    }
  }

  /** The save, in one transaction; a racing twin's unique violation reruns it once and finds the twin's row (B26). */
  async function save(
    key: string,
    organizationId: string,
    input: ReturnType<typeof websiteEnquiryInput.parse>,
    at: Date,
  ): Promise<ReturnType<typeof answerOf>> {
    // Found afresh: who gets the lead, who can work it, and the agency's name for the consent words.
    const ownerUserId = await identity.firstOwner(organizationId);
    const workers = new Set((await identity.leadWorkers(organizationId)).map((worker) => worker.userId));
    const organization = await identity.organizationProfile(organizationId);
    const run = () =>
      db.forOrg(organizationId, async (tx) => {
        // The agency may have gone read-only since the page loaded (W23).
        const form = await assertFormOpen(tx, { key, organizationId, ownerUserId, now: at });
        if (ownerUserId === null || organization === null) throw formNotFound();
        const outcome = await receiveWebsiteEnquiry(
          tx,
          {
            organizationId,
            ownerUserId,
            workers,
            form,
            agencyName: organization.name,
            via: input.via,
            embeddedOn: input.embeddedOn ?? null,
            now: at,
          },
          input,
        );
        return answerOf(outcome);
      });
    try {
      return await run();
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      return run();
    }
  }

  /** The honeypot: the submission is recorded as spam and thanked (W36); a bot is told nothing. */
  async function dropAsSpam(
    organizationId: string,
    form: WebsiteFormRow,
    submissionId: string,
    at: Date,
  ): Promise<void> {
    await db.forOrg(organizationId, (tx) =>
      recordSubmission(tx, { formId: form.id, submissionId, outcome: "spam", reason: "honeypot", now: at }),
    );
  }

  app.post("/website-forms/:key/enquiries", requireTrustedJson(identity), limitBody(MAX_BODY_BYTES), async (c) => {
    try {
      // 1. Size and shape: JSON, a strict object, answers bounded by the contract.
      const body: unknown = await c.req.json().catch(() => {
        throw badShape();
      });
      const shaped = websiteEnquiryInput.safeParse(body);
      if (!shaped.success) throw badShape();
      const input = shaped.data;
      // 2. The key's shape, without the database.
      const key = c.req.param("key");
      const parsed = parseFormKey(key);
      if (parsed === null) throw formNotFound();
      const { organizationId } = parsed;
      noteOrganization(c, organizationId);
      // 3. Limits: every attempt counts, the refused ones below too.
      const limited = await hitFormLimits({
        limiter,
        logger: requestOf(c)?.logger ?? logger,
        organizationId,
        address: addressOf(c.req.raw),
        kind: "submit",
      });
      if (!limited.allowed) {
        if (limited.agencyRefused) await tellOwnerOfFlood(key, organizationId);
        return tooManyTries(c, limited.retryAfterSeconds);
      }
      // 4. The form and whether it can take enquiries; outside the save's transaction.
      const at = now();
      const ownerUserId = await identity.firstOwner(organizationId);
      const form = await db.forOrg(organizationId, (tx) =>
        assertFormOpen(tx, { key, organizationId, ownerUserId, now: at }),
      );
      // 5. The traps: honeypot, fill time, links.
      if (input.homepage.trim() !== "") {
        await dropAsSpam(organizationId, form, input.submissionId, at);
        const answer = answerOf("spam");
        return c.json(answer.body, answer.status);
      }
      checkOpenedToken(tokenKey, input.openedToken, form.id, at);
      assertNoLinks(input.answers);
      // 6. Turnstile, when the server has keys: a network call, made outside any transaction (W39).
      if (botCheck !== null) {
        const result =
          input.turnstileToken === undefined
            ? "fail"
            : await botCheck.verify({ token: input.turnstileToken, address: addressOf(c.req.raw) });
        if (result === "unreachable") {
          (requestOf(c)?.logger ?? logger).warn({ organizationId }, "bot check unreachable: enquiry accepted");
        }
        assertNotBot(result);
      }
      // 7. The save.
      const answer = await save(key, organizationId, input, at);
      return c.json(answer.body, answer.status);
    } catch (error) {
      if (error instanceof DomainError) return refusal(c, error);
      throw error;
    }
  });

  return app;
}

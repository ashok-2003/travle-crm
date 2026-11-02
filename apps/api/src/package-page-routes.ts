// The public package pages' routes, with no session and no CORS (release 7b): the agency's page of packages, one package's page
// (cacheable for a minute: it holds only what the agency published), and the enquiry a visitor sends from it, checked as the
// website form's is (limits, honeypot, fill time, Turnstile) and saved as a lead with the source "package_page". Every outcome
// that is not a refusal gets the one answer, so a page can't be used to learn who is a customer.
import { packageEnquiryInput } from "@travel-crm/contracts/package-pages";
import { publicPackageListOf, publicPackageOf } from "@travel-crm/api";
import { isUniqueViolation } from "@travel-crm/db";
import { answerOf, findPackageSubmission, recordPackageSpam } from "@travel-crm/domain/crm";
import { calendarDateIn, DomainError } from "@travel-crm/domain/kernel";
import { pageUnavailable, publishedPackage, receiveEnquiryOnPackage } from "@travel-crm/domain/package-pages";
import {
  assertNotBot,
  checkOpenedToken,
  formLimits,
  formTokenKey,
  signOpenedToken,
} from "@travel-crm/domain/website-forms";
import { Hono } from "hono";
import { limitBody } from "./body-limit.js";
import { formClientAddressFrom } from "./form-client-address.js";
import { hitFormLimits } from "./form-limits.js";
import { requestOf, type RequestLogEnv } from "./request-log.js";
import { requireTrustedJson } from "./trusted-origin.js";
import { noteOrganization, refusal, tooManyTries, type WebsiteFormRouteDependencies } from "./website-form-shared.js";

const badShape = () => new DomainError("VALIDATION", "VALIDATION", "Check your details and try again");

/** A package page's address part, as the agency's sign-in code and a slug are written: nothing else reaches the database. */
const CODE = /^[A-Za-z0-9]{3,12}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The routes to mount at /api/public. */
export function packagePageRoutes(dependencies: WebsiteFormRouteDependencies): Hono<RequestLogEnv> {
  const { db, identity, profiles, files, limiter, logger, turnstile, authSecret } = dependencies;
  const now = dependencies.now ?? (() => new Date());
  const addressOf = formClientAddressFrom(dependencies.address);
  const tokenKey = formTokenKey(authSecret);
  const app = new Hono<RequestLogEnv>();
  const services = { db, identity, profiles, files };

  const notAvailable = (c: Parameters<typeof refusal>[0]) => {
    c.header("Cache-Control", "no-store");
    return c.json({ available: false as const }, 404);
  };

  app.get("/packages/:code", async (c) => {
    const code = c.req.param("code");
    if (!CODE.test(code)) return notAvailable(c);
    const limited = await hitFormLimits({
      limiter,
      logger: requestOf(c)?.logger ?? logger,
      key: `pkg:${code.toLowerCase()}`,
      address: addressOf(c.req.raw),
      kind: "view",
    });
    if (!limited.allowed) return tooManyTries(c, limited.retryAfterSeconds);
    const page = await publicPackageListOf(services, { code });
    if (page === null) return notAvailable(c);
    c.header("Cache-Control", "public, s-maxage=60");
    return c.json({ available: true as const, page });
  });

  app.get("/packages/:code/:slug", async (c) => {
    const { code, slug } = c.req.param();
    if (!CODE.test(code) || !SLUG.test(slug)) return notAvailable(c);
    const limited = await hitFormLimits({
      limiter,
      logger: requestOf(c)?.logger ?? logger,
      key: `pkg:${code.toLowerCase()}`,
      address: addressOf(c.req.raw),
      kind: "view",
    });
    if (!limited.allowed) return tooManyTries(c, limited.retryAfterSeconds);
    const organization = await identity.organizationByCode(code);
    if (organization === null) return notAvailable(c);
    const at = now();
    const page = await publicPackageOf(services, {
      code,
      slug,
      openedToken: signOpenedToken(tokenKey, organization.id, at),
      turnstileSiteKey: turnstile?.siteKey ?? null,
      now: at,
    });
    if (page === null) return notAvailable(c);
    c.header("Cache-Control", "public, s-maxage=60");
    return c.json({ available: true as const, page });
  });

  app.post(
    "/packages/:code/:slug/enquiries",
    requireTrustedJson(identity),
    limitBody(formLimits.maxBodyBytes),
    async (c) => {
      c.header("Cache-Control", "no-store");
      try {
        // 1. Size and shape: JSON, a strict object, answers bounded by the contract.
        const body: unknown = await c.req.json().catch(() => {
          throw badShape();
        });
        const shaped = packageEnquiryInput.safeParse(body);
        if (!shaped.success) throw badShape();
        const input = shaped.data;
        const { code, slug } = c.req.param();
        if (!CODE.test(code) || !SLUG.test(slug)) throw pageUnavailable();
        const organization = await identity.organizationByCode(code);
        if (organization === null) throw pageUnavailable();
        const organizationId = organization.id;
        noteOrganization(c, organizationId);
        // 2. Limits: every attempt counts, the refused ones below too.
        const key = `pkg:${code.toLowerCase()}`;
        const limited = await hitFormLimits({
          limiter,
          logger: requestOf(c)?.logger ?? logger,
          key,
          address: addressOf(c.req.raw),
          kind: "submit",
        });
        if (!limited.allowed) return tooManyTries(c, limited.retryAfterSeconds);
        const at = now();
        const today = calendarDateIn(at, organization.timeZone);
        // 3. The package, and a submission already in the ledger, answered as it was the first time.
        const known = await db.forOrg(organizationId, async (tx) => {
          const row = await publishedPackage(tx, slug);
          if (row === null) throw pageUnavailable();
          return { packageId: row.id, prior: await findPackageSubmission(tx, input.submissionId) };
        });
        if (known.prior !== null) {
          const answer = answerOf(known.prior.outcome);
          return c.json(answer.body, answer.status);
        }
        // 4. The traps: honeypot, fill time.
        if (input.homepage.trim() !== "") {
          await db.forOrg(organizationId, (tx) =>
            recordPackageSpam(tx, { submissionId: input.submissionId, packageId: known.packageId, now: at }),
          );
          const answer = answerOf("spam");
          return c.json(answer.body, answer.status);
        }
        checkOpenedToken(tokenKey, input.openedToken, organizationId, at);
        // 5. Turnstile, when the server has keys: a network call, made outside any transaction.
        if (turnstile !== null) {
          const result =
            input.turnstileToken === undefined || input.turnstileToken === ""
              ? "fail"
              : await turnstile.botCheck.verify({ token: input.turnstileToken });
          if (result === "unreachable") {
            (requestOf(c)?.logger ?? logger).warn({ organizationId }, "bot check unreachable: enquiry accepted");
          }
          assertNotBot(result);
        }
        // 6. The save, in one transaction; a racing twin's unique violation reruns it once and finds the twin's row.
        const ownerUserId = await identity.firstOwner(organizationId);
        if (ownerUserId === null) throw pageUnavailable();
        const workers = new Set((await identity.leadWorkers(organizationId)).map((worker) => worker.userId));
        const save = () =>
          db.forOrg(organizationId, (tx) =>
            receiveEnquiryOnPackage(tx, { organizationId, ownerUserId, workers, today, now: at }, slug, input),
          );
        let outcome;
        try {
          outcome = await save();
        } catch (error) {
          if (!isUniqueViolation(error)) throw error;
          outcome = await save();
        }
        const answer = answerOf(outcome);
        return c.json(answer.body, answer.status);
      } catch (error) {
        if (error instanceof DomainError) return refusal(c, error);
        throw error;
      }
    },
  );

  return app;
}

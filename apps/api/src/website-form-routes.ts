// The website form's public routes, with no session and no CORS (spec 5): the form for a visitor's page, and the
// address check the Owner uses to set the proxy hops. The enquiry itself is in website-form-submit.ts.
import { publicFormQuery, websiteFormPublic } from "@travel-crm/contracts/website-forms";
import { closedFormOf, publicFormOf } from "@travel-crm/api";
import { DomainError } from "@travel-crm/domain/kernel";
import {
  assertFormOpen,
  formLimits,
  formTokenKey,
  parseFormKey,
  readWebsiteForm,
  signOpenedToken,
} from "@travel-crm/domain/website-forms";
import { Hono } from "hono";
import { clientAddressReport, formClientAddressFrom } from "./form-client-address.js";
import { hitFormLimits } from "./form-limits.js";
import { requestOf, type RequestLogEnv } from "./request-log.js";
import { websiteFormSubmitRoute } from "./website-form-submit.js";
import {
  formNotFound,
  noteOrganization,
  refusal,
  tooManyTries,
  type WebsiteFormRouteDependencies,
} from "./website-form-shared.js";

/** The routes to mount at /api/public. */
export function websiteFormRoutes(dependencies: WebsiteFormRouteDependencies): Hono<RequestLogEnv> {
  const { db, identity, profiles, files, limiter, logger, turnstile, authSecret } = dependencies;
  const now = dependencies.now ?? (() => new Date());
  const addressOf = formClientAddressFrom(dependencies.address);
  const tokenKey = formTokenKey(authSecret);
  const app = new Hono<RequestLogEnv>();

  // The state must be exact, and a forwarding cache must never hold a visitor's page.
  app.use("*", async (c, next) => {
    await next();
    c.header("Cache-Control", "no-store");
  });

  app.get("/website-forms/:key", async (c) => {
    const key = c.req.param("key");
    const parsed = parseFormKey(key);
    if (parsed === null) return refusal(c, formNotFound());
    const { organizationId } = parsed;
    noteOrganization(c, organizationId);
    const query = publicFormQuery.safeParse({ via: c.req.query("via") });
    if (!query.success)
      return refusal(c, new DomainError("VALIDATION", "VALIDATION", "Check the address and try again"));
    const { via } = query.data;
    const limited = await hitFormLimits({
      limiter,
      logger: requestOf(c)?.logger ?? logger,
      key,
      address: addressOf(c.req.raw),
      kind: "view",
    });
    if (!limited.allowed) return tooManyTries(c, limited.retryAfterSeconds);
    const at = now();
    try {
      const ownerUserId = await identity.firstOwner(organizationId);
      // A wrong secret or no form is 404; a form that is closed for any reason is one answer, with its card.
      const opened = await db.forOrg(organizationId, async (tx) => {
        try {
          return { row: await assertFormOpen(tx, { key, organizationId, ownerUserId, via, now: at }), open: true };
        } catch (error) {
          if (!(error instanceof DomainError) || error.reason !== "FORM_UNAVAILABLE") throw error;
          const row = await readWebsiteForm(tx);
          if (row === null) throw formNotFound();
          return { row, open: false };
        }
      });
      const { row } = opened;
      if (!opened.open) {
        return c.json(
          websiteFormPublic.parse({
            available: false,
            form: await closedFormOf({ identity, files }, row),
          }),
        );
      }
      const form = await publicFormOf(
        { db, identity, profiles, files },
        {
          organizationId,
          settings: row,
          openedToken: signOpenedToken(tokenKey, row.id, at),
          turnstileSiteKey: turnstile?.siteKey ?? null,
          now: at,
        },
      );
      return c.json(websiteFormPublic.parse({ available: true, form }));
    } catch (error) {
      if (error instanceof DomainError) return refusal(c, error);
      throw error;
    }
  });

  // What the Owner reads to pick PUBLIC_FORM_PROXY_HOPS (W33): the address counted for the caller, never other headers.
  app.get("/client-address", async (c) => {
    const report = clientAddressReport(c.req.raw, dependencies.address, addressOf);
    if (report.address !== null) {
      const result = await limiter.hit(`client-address:${report.address}`, formLimits.clientAddress);
      if (!result.allowed) return tooManyTries(c, result.retryAfterSeconds);
    }
    return c.json(report);
  });

  app.route("/", websiteFormSubmitRoute(dependencies, addressOf, tokenKey, now));
  return app;
}

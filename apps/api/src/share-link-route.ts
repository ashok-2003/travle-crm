// GET /p/<token> (spec 9.3): a customer opens a shared record without signing in. The route opens the link and hands
// the record to the resolver for its type (a redirect to a PDF, later a page); a link that doesn't work gets a small
// page saying why, because people open these links in a browser.
import { brand } from "@travel-crm/brand";
import { DomainError } from "@travel-crm/domain/kernel";
import type { OpenedShareLink, ShareLinkVisitor } from "@travel-crm/domain/share-links";
import { Hono } from "hono";

/** Shows a shared record of one type, e.g. redirects to an issued document's PDF. */
export type ShareLinkResolver = (opened: OpenedShareLink) => Promise<Response>;

export interface ShareLinkRouteOptions {
  /** findShareLink from @travel-crm/domain/share-links, bound to the database: checks the link, records nothing. */
  find: (token: string) => Promise<OpenedShareLink>;
  /** recordShareLinkOpen, bound to the database: called once the resolver has answered with success. */
  recordOpen: (opened: OpenedShareLink, visitor: ShareLinkVisitor) => Promise<void>;
  /** One resolver per record type that can be shared. */
  resolvers: Readonly<Record<string, ShareLinkResolver>>;
  clientAddress: (request: Request) => string | null;
}

/** Shared records are private: never cached, never indexed, and the token never leaks in a Referer header. */
const privacyHeaders = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex",
  "X-Content-Type-Options": "nosniff",
};

/**
 * Link-preview bots that fetch a link when it is pasted into a chat, not customers looking at the record. WhatsApp's
 * fetcher has a documented shape ("WhatsApp/2.24.1 A"), anchored so that an in-app browser that merely mentions
 * WhatsApp is still a customer. The other tokens are matched anywhere: iMessage's preview agent combines several.
 */
const PREVIEW_USER_AGENTS =
  /^WhatsApp\/[\d.]+ [AIN]$|facebookexternalhit|Facebot|Slackbot|TelegramBot|Twitterbot|LinkedInBot|Discordbot|SkypeUriPreview|Google-PageRenderer|Applebot/i;

/** HEAD requests, browser prefetches and link-preview bots are not a customer opening the link. */
function isPreview(request: Request, userAgent: string | null): boolean {
  const purpose = `${request.headers.get("sec-purpose") ?? ""} ${request.headers.get("purpose") ?? ""}`;
  return (
    request.method === "HEAD" ||
    /prefetch/i.test(purpose) ||
    (userAgent !== null && PREVIEW_USER_AGENTS.test(userAgent))
  );
}

const pages = {
  LINK_NOT_FOUND: {
    status: 404,
    heading: "This link doesn't work",
    advice: "Check that you have the whole link, or ask whoever sent it for a new one.",
  },
  LINK_EXPIRED: { status: 410, heading: "This link has expired", advice: "Ask whoever sent it for a new one." },
  LINK_REVOKED: { status: 410, heading: "This link has been turned off", advice: "Ask whoever sent it for a new one." },
  DOCUMENT_NOT_READY: {
    status: 503,
    heading: "This document is still being prepared",
    advice: "Try the link again in a minute.",
  },
  // Its PDF can never be made (the renderer gave up for good): waiting would not help.
  DOCUMENT_UNAVAILABLE: {
    status: 404,
    heading: "This document can't be shown",
    advice: "Ask whoever sent it for a new copy.",
  },
  TOO_MANY_TRIES: { status: 429, heading: "Too many tries", advice: "Wait a minute, then open the link again." },
} as const;

/** How long a customer is asked to wait for a document the worker is still rendering, in seconds. */
const NOT_READY_RETRY_SECONDS = 30;

type PageReason = keyof typeof pages;

const isPageReason = (reason: string): reason is PageReason => Object.hasOwn(pages, reason);

/** Text content needs only these escaped. */
const escapeHtml = (text: string) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

function errorPage(reason: PageReason, retryAfterSeconds?: number): Response {
  const { status, heading, advice } = pages[reason];
  const retryAfter = retryAfterSeconds ?? (status === 503 ? NOT_READY_RETRY_SECONDS : undefined);
  const { colours, fonts } = brand;
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(heading)} · ${escapeHtml(brand.productName)}</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:${colours.canvas};color:${colours.ink};font-family:"${fonts.ui}",system-ui,sans-serif}
main{max-width:28rem;padding:2rem 1.5rem}
h1{font-family:"${fonts.title}",Georgia,serif;font-weight:600;font-size:1.6rem;margin:0 0 .5rem}
p{color:${colours.muted};line-height:1.5;margin:0}
</style>
</head>
<body><main><h1>${escapeHtml(heading)}</h1><p>${escapeHtml(advice)}</p></main></body>
</html>`;
  return new Response(html, {
    status,
    headers: {
      ...privacyHeaders,
      ...(retryAfter === undefined ? {} : { "Retry-After": String(retryAfter) }),
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    },
  });
}

/** The /p routes' answer over the rate limit: a page, like their others, since customers open these in a browser. */
export function tooManyRequestsPage(retryAfterSeconds: number): Response {
  return errorPage("TOO_MANY_TRIES", retryAfterSeconds);
}

/** A resolver's response with the privacy headers added (a copy: Response.redirect's headers can't be changed). */
function keptPrivate(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(privacyHeaders)) headers.set(name, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

/** The /p routes, to mount with app.route("/p", shareLinkRoutes(...)) behind a rate limit. */
export function shareLinkRoutes(options: ShareLinkRouteOptions): Hono {
  const app = new Hono();

  app.get("/:token", async (c) => {
    const userAgent = c.req.header("user-agent") ?? null;
    const visitor = {
      ipAddress: options.clientAddress(c.req.raw),
      userAgent,
      preview: isPreview(c.req.raw, userAgent),
    };
    let opened: OpenedShareLink;
    try {
      opened = await options.find(c.req.param("token"));
    } catch (error) {
      if (error instanceof DomainError && error.code === "NOT_FOUND") {
        return errorPage(isPageReason(error.reason) ? error.reason : "LINK_NOT_FOUND");
      }
      throw error;
    }
    // Object.hasOwn, so a record type like "constructor" finds no resolver instead of Object's own function.
    const resolve = Object.hasOwn(options.resolvers, opened.recordType)
      ? options.resolvers[opened.recordType]
      : undefined;
    if (!resolve) return errorPage("LINK_NOT_FOUND");
    let response: Response;
    try {
      response = await resolve(opened);
    } catch (error) {
      // A resolver says "not found" (or "not ready yet") the same way the link itself does.
      if (error instanceof DomainError && error.code === "NOT_FOUND") {
        return errorPage(isPageReason(error.reason) ? error.reason : "LINK_NOT_FOUND");
      }
      throw error;
    }
    // Counted and announced only when the customer got the record: not for a 404, a 503 "being prepared" or a failure.
    if (response.status < 400) await options.recordOpen(opened, visitor);
    return keptPrivate(response);
  });

  return app;
}

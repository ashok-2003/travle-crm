// GET /p/<token> (spec 9.3): a customer opens a shared record without signing in. The route opens the link and hands
// the record to the resolver for its type (a redirect to a PDF, later a page); a link that doesn't work gets a small
// page saying why, because people open these links in a browser.
import { brand } from "@travel-crm/brand";
import { DomainError } from "@travel-crm/domain/kernel";
import type { OpenedShareLink, ShareLinkVisitor } from "@travel-crm/domain/share-links";
import { Hono, type Context } from "hono";

/**
 * Shows a shared record of one type, e.g. redirects to an issued document's PDF. `view` says where the page lives and
 * what the customer just did on it (an action's answer), for it to say so.
 */
export type ShareLinkResolver = (opened: OpenedShareLink, view: ShareLinkView) => Promise<Response>;

/** What a page tells the customer about what they just did: it was recorded, or it was refused (the page says why). */
export type ShareLinkNotice = "accepted" | "refused" | "claimed" | "saved" | "feedback";
const NOTICES: readonly string[] = ["accepted", "refused", "claimed", "saved", "feedback"];

export interface ShareLinkView {
  /** The link's own path, /p/<token>: where a page's forms, downloads and uploads are. */
  base: string;
  notice: ShareLinkNotice | null;
  /** The reason code of a refusal, for a page that words it (a code, never a message). */
  why: string | null;
}

/** What a page of one record type serves besides itself: its documents and files, and its pictures sent straight to storage. */
export interface ShareLinkDownloads {
  /** An issued document of the record, as a redirect to a short-lived download of its PDF. */
  document: (opened: OpenedShareLink, documentId: string) => Promise<Response>;
  /** A file attached to the record, the same way. */
  file: (opened: OpenedShareLink, attachmentId: string) => Promise<Response>;
  /** Signs a picture's upload to storage; the body is the page's JSON, checked by the record's module. */
  requestUpload: (opened: OpenedShareLink, body: unknown) => Promise<unknown>;
  /** Confirms the picture arrived. */
  confirmUpload: (opened: OpenedShareLink, body: unknown) => Promise<unknown>;
}
const REASON = /^[A-Z][A-Z_]{2,40}$/;

/** What a customer does on a shared record's page (a POST of its form): what to tell them, or nothing. */
export type ShareLinkAction = (
  opened: OpenedShareLink,
  form: Readonly<Record<string, string | undefined>>,
) => Promise<ShareLinkNotice | undefined>;

export interface ShareLinkRouteOptions {
  /** findShareLink from @travel-crm/domain/share-links, bound to the database: checks the link, records nothing. */
  find: (token: string) => Promise<OpenedShareLink>;
  /** recordShareLinkOpen, bound to the database: called once the resolver has answered with success. */
  recordOpen: (opened: OpenedShareLink, visitor: ShareLinkVisitor) => Promise<void>;
  /** One resolver per record type that can be shared. */
  resolvers: Readonly<Record<string, ShareLinkResolver>>;
  /** What a page's form may do, per record type: a quote's Accept. */
  actions?: Readonly<Record<string, ShareLinkAction>>;
  /** The documents, files and uploads a record type's page serves. */
  downloads?: Readonly<Record<string, ShareLinkDownloads>>;
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
  // Something failed on our side; the log has what.
  SERVER_ERROR: {
    status: 500,
    heading: "This link doesn't work",
    advice: "Something went wrong on our side. Try the link again in a few minutes.",
  },
} as const;

/** How long a customer is asked to wait for a document the worker is still rendering, in seconds. */
const NOT_READY_RETRY_SECONDS = 30;

type PageReason = keyof typeof pages;

const isPageReason = (reason: string): reason is PageReason => Object.hasOwn(pages, reason);

/**
 * The device's own fonts: the page's policy loads nothing (`default-src 'none'`), so a brand font named here would
 * only ever fall back to a serif or sans the page didn't choose.
 */
const SYSTEM_FONTS = 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';

/** Text content needs only these escaped. */
const escapeHtml = (text: string) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

function errorPage(reason: PageReason, retryAfterSeconds?: number): Response {
  const { status, heading, advice } = pages[reason];
  const retryAfter = retryAfterSeconds ?? (status === 503 ? NOT_READY_RETRY_SECONDS : undefined);
  const { colours } = brand;
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(heading)} · ${escapeHtml(brand.productName)}</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:${colours.canvas};color:${colours.ink};font-family:${SYSTEM_FONTS}}
main{max-width:28rem;padding:2rem 1.5rem}
h1{font-weight:500;font-size:1.6rem;margin:0 0 .5rem}
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

/** The /p routes' answer to an error nothing handled: the page customers get when a link doesn't work. */
export function linkFailedPage(): Response {
  return errorPage("SERVER_ERROR");
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
      const done = c.req.query("done");
      const why = c.req.query("why");
      response = await resolve(opened, {
        base: `/p/${encodeURIComponent(c.req.param("token"))}`,
        notice: done !== undefined && NOTICES.includes(done) ? (done as ShareLinkNotice) : null,
        why: why !== undefined && REASON.test(why) ? why : null,
      });
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

  // A page's form, posted back to its own link: the action runs, then the page shows again (POST, redirect, GET).
  app.post("/:token", async (c) => {
    const token = c.req.param("token");
    let opened: OpenedShareLink;
    try {
      opened = await options.find(token);
    } catch (error) {
      if (error instanceof DomainError && error.code === "NOT_FOUND") {
        return errorPage(isPageReason(error.reason) ? error.reason : "LINK_NOT_FOUND");
      }
      throw error;
    }
    const act =
      options.actions !== undefined && Object.hasOwn(options.actions, opened.recordType)
        ? options.actions[opened.recordType]
        : undefined;
    if (!act) return errorPage("LINK_NOT_FOUND");
    const body = await c.req.parseBody();
    const form: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(body)) if (typeof value === "string") form[key] = value.slice(0, 2100);
    let done: ShareLinkNotice | undefined;
    try {
      done = await act(opened, form);
    } catch (error) {
      // A refusal (declined, replaced, not sent) goes back to the page, which says why from the quote's own state.
      if (error instanceof DomainError) {
        const why = REASON.test(error.reason) ? `&why=${error.reason}` : "";
        return c.redirect(`/p/${encodeURIComponent(token)}?done=refused${why}`, 303);
      }
      throw error;
    }
    const target = `/p/${encodeURIComponent(token)}${done === undefined ? "" : `?done=${done}`}`;
    return keptPrivate(new Response(null, { status: 303, headers: { Location: target } }));
  });

  // A record's documents and files, each checked to belong to the record the link opens.
  const download = (kind: "document" | "file") => async (c: Context) => {
    let opened: OpenedShareLink;
    try {
      opened = await options.find(c.req.param("token") ?? "");
    } catch (error) {
      if (error instanceof DomainError && error.code === "NOT_FOUND") {
        return errorPage(isPageReason(error.reason) ? error.reason : "LINK_NOT_FOUND");
      }
      throw error;
    }
    const serves = Object.hasOwn(options.downloads ?? {}, opened.recordType)
      ? options.downloads?.[opened.recordType]
      : undefined;
    if (!serves) return errorPage("LINK_NOT_FOUND");
    try {
      return keptPrivate(await serves[kind](opened, c.req.param("id") ?? ""));
    } catch (error) {
      if (error instanceof DomainError && error.code === "NOT_FOUND") {
        return errorPage(isPageReason(error.reason) ? error.reason : "LINK_NOT_FOUND");
      }
      throw error;
    }
  };
  app.get("/:token/doc/:id", download("document"));
  app.get("/:token/file/:id", download("file"));

  // Pictures go from the page straight to storage: the page asks here for where to put one, then says it arrived. JSON only,
  // so another site's form can't post here (a JSON content type needs a preflight this app never answers).
  const upload = (step: "requestUpload" | "confirmUpload") => async (c: Context) => {
    if (!(c.req.header("content-type") ?? "").toLowerCase().startsWith("application/json")) {
      return c.json({ error: "JSON_ONLY" }, 415);
    }
    let opened: OpenedShareLink;
    try {
      opened = await options.find(c.req.param("token") ?? "");
    } catch (error) {
      if (error instanceof DomainError && error.code === "NOT_FOUND") return c.json({ error: error.reason }, 404);
      throw error;
    }
    const serves = Object.hasOwn(options.downloads ?? {}, opened.recordType)
      ? options.downloads?.[opened.recordType]
      : undefined;
    if (!serves) return c.json({ error: "LINK_NOT_FOUND" }, 404);
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "INVALID_JSON" }, 400);
    }
    try {
      return c.json((await serves[step](opened, body)) ?? {}, 200, privacyHeaders);
    } catch (error) {
      if (error instanceof DomainError) {
        return c.json(
          { error: error.reason },
          error.code === "NOT_FOUND" ? 404 : error.code === "CONFLICT" ? 409 : 400,
          privacyHeaders,
        );
      }
      throw error;
    }
  };
  app.post("/:token/upload", upload("requestUpload"));
  app.post("/:token/upload/confirm", upload("confirmUpload"));

  return app;
}

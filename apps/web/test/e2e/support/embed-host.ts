// An agency's own website for the embed journeys (spec 13, journey 9): a page on an https address of its own that is not the
// product's, so the browser frames the form across origins as it does for a visitor. It needs no server: the context answers
// this one address itself. It must be https, because /embed answers `frame-ancestors https:` (spec 5.3) and a plain http
// page would be refused, which is the rule working. The product itself runs on plain http here, and a browser sends no
// referrer from https to http, so the page asks for the full one: with both on https, as in a deploy, the default policy
// gives the frame the website's origin, which is all the form reads.
import type { BrowserContext } from "@playwright/test";

export const hostOrigin = "https://agency-site.example.test";

export interface EmbedHost {
  origin: string;
  /** A page with the agency's script tag, as the snippet dialog gives it, for this form key. */
  pageWith(key: string): string;
  /** A page with an iframe that points at the hosted /f/ form, which the browser must refuse to show. */
  pageFramingHosted(key: string): string;
}

/** Makes `context` answer for the agency's website; `webUrl` is where the product's script and form are. */
export async function embedHost(context: BrowserContext, webUrl: string): Promise<EmbedHost> {
  // The product runs on this computer's loopback address and the agency's page does not: Chromium asks a public page for
  // leave before it reaches a local address (local network access). A real visitor reaches the product's public address.
  await context.grantPermissions(["local-network-access"], { origin: hostOrigin });
  await context.route(`${hostOrigin}/**`, async (route) => {
    const url = new URL(route.request().url());
    const [, kind, key = ""] = url.pathname.split("/");
    const body =
      kind === "script"
        ? `<script src="${webUrl}/embed.js" data-form="${key}" async></script>`
        : `<iframe id="hosted" title="Hosted form" src="${webUrl}/f/${key}" width="500" height="400"></iframe>`;
    await route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="unsafe-url"><title>Sharma Travels</title></head><body><main><h1>Sharma Travels</h1><p>Plan your next trip with us.</p>${body}</main></body></html>`,
    });
  });
  return {
    origin: hostOrigin,
    pageWith: (key) => `${hostOrigin}/script/${key}`,
    pageFramingHosted: (key) => `${hostOrigin}/frame/${key}`,
  };
}

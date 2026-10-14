// The product's one email layout: a heading, paragraphs, an optional action button and a footer, in the brand's
// colours and fonts, as HTML and as plain text. Every value is escaped: names and titles come from users.
import { brand } from "@travel-crm/brand";

export interface EmailContent {
  heading: string;
  paragraphs: readonly string[];
  /** A button in HTML, a labelled link in text. Must be an absolute http(s) URL. */
  action?: { label: string; url: string } | undefined;
  /** Why the person gets this email, e.g. "You get these because you shared the link." */
  footer: string;
}

const escapeHtml = (text: string): string =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

/** Email clients don't load web fonts reliably, so each brand font falls back to a system one. */
const fonts = {
  title: `'${brand.fonts.title}', Georgia, 'Times New Roman', serif`,
  ui: `'${brand.fonts.ui}', -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`,
};

function assertWebLink(url: string): void {
  let protocol: string;
  try {
    protocol = new URL(url).protocol;
  } catch {
    throw new RangeError(`An email action needs an absolute http(s) URL, got ${JSON.stringify(url)}`);
  }
  if (protocol !== "https:" && protocol !== "http:") {
    throw new RangeError(`An email action needs an http(s) URL, got ${JSON.stringify(protocol)}`);
  }
}

export function renderEmail(content: EmailContent): { html: string; text: string } {
  if (content.action) assertWebLink(content.action.url);
  const { colours } = brand;

  const paragraphs = content.paragraphs
    .map((paragraph) => `<p style="margin:0 0 16px;line-height:1.5">${escapeHtml(paragraph)}</p>`)
    .join("");
  const action = content.action
    ? `<p style="margin:24px 0"><a href="${escapeHtml(content.action.url)}" style="display:inline-block;` +
      `background:${colours.action};color:#ffffff;text-decoration:none;font-weight:600;padding:12px 24px;` +
      `border-radius:999px">${escapeHtml(content.action.label)}</a></p>`
    : "";
  const html =
    `<!doctype html><html><body style="margin:0;background:${colours.canvas};color:${colours.ink};` +
    `font-family:${fonts.ui};font-size:16px">` +
    `<div style="max-width:560px;margin:0 auto;padding:32px 24px">` +
    `<h1 style="font-family:${fonts.title};font-weight:600;font-size:26px;margin:0 0 24px">` +
    `${escapeHtml(content.heading)}</h1>${paragraphs}${action}` +
    `<hr style="border:none;border-top:1px solid ${colours.hairline};margin:32px 0 16px">` +
    `<p style="margin:0 0 8px;color:${colours.muted};font-size:13px">${escapeHtml(content.footer)}</p>` +
    `<p style="margin:0;color:${colours.muted};font-size:13px">Sent with ${escapeHtml(brand.productName)}</p>` +
    `</div></body></html>`;

  const text = [
    content.heading,
    ...content.paragraphs,
    ...(content.action ? [`${content.action.label}: ${content.action.url}`] : []),
  ]
    .join("\n\n")
    .concat(`\n\n--\n${content.footer}\nSent with ${brand.productName}`);

  return { html, text };
}

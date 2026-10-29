// What the customer-facing pages at /p/<token> share: escaping, the rupee and day words, the stylesheet and the page's
// security headers. Plain HTML with the device's fonts; nothing is loaded from elsewhere.
import { brand } from "@travel-crm/brand";
import { formatMoney, money } from "@travel-crm/domain/kernel";

export const SYSTEM_FONTS = 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';

/** Text and attribute values need these escaped. */
export const escapeHtml = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
export const rupees = (paise: number) => escapeHtml(formatMoney(money(paise)));
export const paragraphs = (text: string) => escapeHtml(text).replaceAll("\n", "<br>");

const dayWords = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const shortDayWords = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
export const dayOf = (day: string) => escapeHtml(dayWords.format(new Date(`${day}T00:00:00Z`)));
export const shortDayOf = (day: string) => escapeHtml(shortDayWords.format(new Date(`${day}T00:00:00Z`)));

/** A link is shown only when it is an http(s) address; anything else (javascript:) is dropped. */
export const safeLink = (link: string) => (/^https?:\/\/\S+$/.test(link) ? escapeHtml(link) : null);

/** The page's stylesheet, in the brand's colours. */
export function styles(): string {
  const { colours } = brand;
  return `
body{margin:0;background:${colours.canvas};color:${colours.ink};font-family:${SYSTEM_FONTS};line-height:1.5}
main{max-width:40rem;margin:0 auto;padding:1.5rem 1rem 3rem}
header p{margin:0;color:${colours.muted}}
h1{font-weight:600;font-size:1.6rem;margin:.25rem 0}
h2{font-size:1.1rem;margin:0 0 .5rem}
h3{font-size:1rem;margin:.75rem 0 .25rem}
section{background:${colours.surface};border-radius:12px;padding:1rem;margin-top:1rem}
ol,ul.plain{list-style:none;padding:0;margin:0}li{margin-bottom:.75rem}li p{margin:.25rem 0 0;color:${colours.muted}}
table{width:100%;border-collapse:collapse}td{padding:.5rem 0;vertical-align:top}td.n{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
small{display:block;color:${colours.muted}}
tfoot td{font-weight:600}
a{color:${colours.action}}
.button{display:inline-flex;align-items:center;justify-content:center;background:${colours.action};color:${colours.onAction};border:0;border-radius:999px;padding:.8rem 1.4rem;font-size:1rem;font-weight:600;text-decoration:none;min-height:44px;cursor:pointer;box-sizing:border-box}
.button.quiet{background:transparent;color:${colours.action};box-shadow:inset 0 0 0 2px ${colours.action}}
label{display:block;margin:.5rem 0 .25rem}
input[type=text],input[type=tel],input[type=date],input[type=number],input:not([type]),select,textarea{width:100%;box-sizing:border-box;padding:.7rem;font-size:1rem;border-radius:8px;border:1px solid ${colours.inputBorder};min-height:44px;font-family:inherit;background:${colours.canvas};color:${colours.ink}}
textarea{min-height:5.5rem}
.tick{display:flex;gap:.5rem;align-items:flex-start;margin:1rem 0}
.tick input{width:1.5rem;height:1.5rem;flex:none}
fieldset{border:0;padding:0;margin:0}legend{font-weight:600;margin-bottom:.25rem}
.notice{background:${colours.action};color:${colours.onAction}}
.notice a{color:${colours.onAction}}
.status{font-weight:600}
.stars{display:flex;gap:.25rem;flex-wrap:wrap}
.stars label{display:flex;align-items:center;gap:.25rem;margin:0;min-height:44px;padding-right:.75rem}
.stars input{width:1.5rem;height:1.5rem}
details{margin-top:.5rem}summary{cursor:pointer;min-height:44px;display:flex;align-items:center;font-weight:600}
.row{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center;margin-top:.5rem}
.hint{color:${colours.muted};font-size:.9rem}
`;
}

export interface PageSecurity {
  /** Allows the page's one inline script, by this value; none for a page without one. */
  nonce?: string;
  /** Where files go straight to (the bucket's origin); the script may connect there. */
  storageOrigin?: string | null;
  /** Whether the page has a form posting back to itself. */
  forms: boolean;
}

/** The headers of a customer page: nothing loads but its own style and, when it has one, its script; no framing. */
export function securityHeaders(security: PageSecurity): Record<string, string> {
  const script = security.nonce === undefined ? "" : ` script-src 'nonce-${security.nonce}';`;
  const connect =
    security.nonce === undefined || !security.storageOrigin ? "" : ` connect-src 'self' ${security.storageOrigin};`;
  return {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Security-Policy": `default-src 'none'; style-src 'unsafe-inline';${script}${connect} base-uri 'none'; form-action ${security.forms ? "'self'" : "'none'"}; frame-ancestors 'none'`,
  };
}

/** The document around a page's body. */
export function document(input: {
  title: string;
  agencyName: string;
  body: string;
  script?: { nonce: string; code: string };
}): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(input.title)} · ${escapeHtml(input.agencyName)}</title>
<style>${styles()}</style>
</head>
<body><main>
${input.body}
</main>${input.script === undefined ? "" : `<script nonce="${input.script.nonce}">${input.script.code}</script>`}</body>
</html>`;
}

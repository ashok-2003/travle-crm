// What the customer-facing pages at /p/<token> share: escaping, the rupee and day words, the app's look (its three
// typefaces, cards, buttons, status pills, the day boxes, a phone's bottom bar) and the page's security headers. Plain
// HTML and CSS: the fonts come from the web app's own /fonts (the same address, since /p is the web app's address
// rewritten to the api; reached directly, the page reads in the device's own fonts), and nothing from another origin.
import { brand, type StatusColour } from "@travel-crm/brand";
import { formatRupees } from "@travel-crm/domain/kernel";
import { qrSvg } from "@travel-crm/integrations/qr";

export const SYSTEM_FONTS = 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';

/** Text and attribute values need these escaped. */
export const escapeHtml = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
/** Whole rupees ("₹52,500"), for a total a customer reads rather than reconciles. */
export const wholeRupees = (paise: number) => escapeHtml(formatRupees(paise));
export const paragraphs = (text: string) => escapeHtml(text).replaceAll("\n", "<br>");

const dayWords = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const shortDayWords = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
export const dayOf = (day: string) => escapeHtml(dayWords.format(new Date(`${day}T00:00:00Z`)));
export const shortDayOf = (day: string) => escapeHtml(shortDayWords.format(new Date(`${day}T00:00:00Z`)));
/** A day as DESIGN.md writes one: "25 Nov" in `today`'s year, "6 Jan 2027" in another. */
export const dayIn = (day: string, today: string) =>
  day.slice(0, 4) === today.slice(0, 4) ? shortDayOf(day) : dayOf(day);

/** A link is shown only when it is an http(s) address; anything else (javascript:) is dropped. */
export const safeLink = (link: string) => (/^https?:\/\/\S+$/.test(link) ? escapeHtml(link) : null);

/** "WhatsApp us": a chat with the agency's main WhatsApp number (E.164), opened in WhatsApp; nothing without one. */
export const whatsappUs = (number: string | null) =>
  number === null
    ? ""
    : `<a class="button secondary" href="https://wa.me/${number.replace(/\D/g, "")}" target="_blank" rel="noopener noreferrer">WhatsApp us</a>`;

export type Tone = "good" | "attention" | "bad" | "neutral";

/** A status as the app shows one (DESIGN.md "Dot Plus Word"): a dot and its word on the tone's tint. */
export const pill = (tone: Tone, words: string) => `<span class="pill ${tone}">${escapeHtml(words)}</span>`;

/** A card with its heading; nothing when it has nothing to show. */
export const card = (heading: string, body: string, attributes = "") =>
  body === "" ? "" : `<section${attributes}><h2>${heading}</h2>${body}</section>`;

/** An amount in the numbers font, in whole rupees. */
export const amount = (paise: number) => `<span class="amount">${wholeRupees(paise)}</span>`;

/** A part of a whole as a bar; the words beside it say the amounts. */
export const progress = (part: number, whole: number) =>
  `<div class="progress" aria-hidden="true"><span style="width:${String(whole <= 0 ? 0 : Math.min(100, Math.round((part / whole) * 100)))}%"></span></div>`;

/** The trip's days as the quote page draws them: blue boxes, one below the other. Each item is its own HTML. */
export const dayBoxes = (days: string[]) => (days.length === 0 ? "" : `<ol class="days">${days.join("")}</ol>`);

/** The header both pages open with: the agency, who it is for, the trip's name big, its dates and people, its status. */
export function pageHeader(input: {
  /** Plain text, escaped here. */
  agencyName: string;
  title: string;
  /** HTML, escaped by the caller: who it is for, the dates and people, and the status pill. */
  forHtml: string;
  whenHtml: string;
  statusHtml: string;
}) {
  return `<header><p class="agency">${escapeHtml(input.agencyName)}</p><p>${input.forHtml}</p><h1>${escapeHtml(input.title)}</h1>
<p class="when">${input.whenHtml}</p>${input.statusHtml}</header>`;
}

/** Pay by UPI: the agency's QR once its UPI id is verified, the button that opens the customer's UPI app, and the id. */
export function payByUpi(input: {
  payLink: string;
  upiId: string;
  upiVerified: boolean;
  payPaise: number;
  agencyName: string;
}): string {
  const qr = input.upiVerified
    ? `<div class="qr">${qrSvg(input.payLink, `UPI QR to pay ${wholeRupees(input.payPaise)} to ${input.agencyName}`)}</div>`
    : "";
  return `<div class="pay">${qr}<div><a class="button" href="${escapeHtml(input.payLink)}">Pay by UPI</a><p>${input.upiVerified ? "Scan the code with any UPI app, or pay" : "Pay"} to UPI id <strong>${escapeHtml(input.upiId)}</strong>.</p><p class="hint">The money goes straight to ${escapeHtml(input.agencyName)}.</p></div></div>`;
}

/** The page's one main action, in a bar at the foot of a phone's screen (a desktop has it on the page itself). */
export const bottomBar = (action: { href: string; words: string }) =>
  `<nav class="bar" aria-label="Next step"><a class="button" href="${escapeHtml(action.href)}">${escapeHtml(action.words)}</a></nav>`;

// The ranges of @fontsource's two files of each typeface: Latin has the digits, its extended twin has ₹.
const LATIN =
  "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";
const LATIN_EXTENDED =
  "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF";

/** The files the web app's generate step copies to its public/fonts (apps/web/scripts/customer-fonts.ts). */
const FONT_FACES = [
  {
    family: brand.fonts.ui,
    weight: "300 900",
    latin: "figtree-latin-wght-normal.woff2",
    extended: "figtree-latin-ext-wght-normal.woff2",
  },
  {
    family: brand.fonts.title,
    weight: "400 800",
    latin: "eb-garamond-latin-wght-normal.woff2",
    extended: "eb-garamond-latin-ext-wght-normal.woff2",
  },
  {
    family: brand.fonts.numbers,
    weight: "400",
    latin: "ibm-plex-mono-latin-400-normal.woff2",
    extended: "ibm-plex-mono-latin-ext-400-normal.woff2",
  },
  {
    family: brand.fonts.numbers,
    weight: "500",
    latin: "ibm-plex-mono-latin-500-normal.woff2",
    extended: "ibm-plex-mono-latin-ext-500-normal.woff2",
  },
];

const fontFaces = () =>
  FONT_FACES.flatMap((face) =>
    [
      [face.latin, LATIN],
      [face.extended, LATIN_EXTENDED],
    ].map(
      ([file = "", range = ""]) =>
        `@font-face{font-family:"${face.family}";src:url("/fonts/${file}") format("woff2");font-weight:${face.weight};font-style:normal;font-display:swap;unicode-range:${range}}`,
    ),
  ).join("\n");

/** The brand's colours as custom properties: the only colours the stylesheet names. */
function tokens(): string {
  const { colours } = brand;
  const tone = (name: string, colour: StatusColour) =>
    `--${name}-dot:${colour.dot};--${name}-fill:${colour.fill};--${name}-ink:${colour.ink}`;
  return `:root{--ink:${colours.ink};--muted:${colours.muted};--canvas:${colours.canvas};--surface:${colours.surface};--hairline:${colours.hairline};--input:${colours.inputBorder};--action:${colours.action};--action-pressed:${colours.actionPressed};--on-action:${colours.onAction};--money:${colours.money};--sky-fill:${colours.avatar.sky.fill};--sky-ink:${colours.avatar.sky.ink};${tone("good", colours.status.good)};${tone("attention", colours.status.attention)};${tone("bad", colours.status.bad)};${tone("neutral", colours.status.neutral)};--ui:"${brand.fonts.ui}",${SYSTEM_FONTS};--title:"${brand.fonts.title}",Georgia,"Times New Roman",serif;--numbers:"${brand.fonts.numbers}",${SYSTEM_FONTS}}`;
}

/** The page's stylesheet: DESIGN.md's tokens, cards, type and controls, for a 360px phone first. */
export function styles(): string {
  return `
${fontFaces()}
${tokens()}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;scroll-padding-top:1rem}
body{overflow-wrap:anywhere;margin:0;background:var(--canvas);color:var(--ink);font-family:var(--ui);font-size:1rem;line-height:1.5;-webkit-font-smoothing:antialiased}
main{max-width:42rem;margin:0 auto;padding:1.5rem 1rem 3rem}
p{margin:.5rem 0}
header{padding:.25rem 0 .75rem}
header p{margin:0;color:var(--muted)}
header .agency{color:var(--ink);font-weight:600;margin-bottom:.125rem}
header .when{color:var(--ink);margin:.25rem 0 .75rem}
h1{font-family:var(--title);font-weight:500;font-size:2rem;line-height:1.15;letter-spacing:-.01em;margin:.75rem 0 0;text-wrap:balance}
h2{font-size:1.0625rem;font-weight:600;line-height:1.4;margin:0 0 .75rem}
h3{font-size:1rem;font-weight:600;margin:1.25rem 0 .25rem}
section{background:var(--canvas);border:1px solid var(--hairline);border-radius:10px;padding:1rem;margin-top:.75rem}
section>:last-child{margin-bottom:0}
a{color:var(--action);text-underline-offset:.15em}
:focus-visible{outline:2px solid var(--action);outline-offset:2px}
strong{font-weight:600}
small{display:block;color:var(--muted);font-size:.875rem}
.hint{color:var(--muted);font-size:.9375rem}
.amount,td.n,.total{font-family:var(--numbers);font-variant-numeric:tabular-nums}
.total{font-size:1.75rem;font-weight:500;line-height:1.2;letter-spacing:-.01em;margin:1rem 0 0}
table{width:100%;border-collapse:collapse}
td{padding:.625rem 0;vertical-align:top;border-top:1px solid var(--hairline)}
tr:first-child td{border-top:0}
td.n{text-align:right;white-space:nowrap;padding-left:1rem}
td.n .pill{margin-top:.25rem}
ol,ul.plain{list-style:none;padding:0;margin:0}
.pill{display:inline-flex;align-items:center;gap:.375rem;height:1.5rem;padding:0 .5rem;border-radius:4px;font-family:var(--ui);font-size:.8125rem;font-weight:500;line-height:1;white-space:nowrap;vertical-align:middle;background:var(--neutral-fill);color:var(--neutral-ink)}
.pill::before{content:"";flex:none;width:6px;height:6px;border-radius:999px;background:var(--neutral-dot)}
td .pill{white-space:normal;height:auto;min-height:1.5rem;padding:.25rem .5rem;line-height:1.25}
.pill.good{background:var(--good-fill);color:var(--good-ink)}.pill.good::before{background:var(--good-dot)}
.pill.attention{background:var(--attention-fill);color:var(--attention-ink)}.pill.attention::before{background:var(--attention-dot)}
.pill.bad{background:var(--bad-fill);color:var(--bad-ink)}.pill.bad::before{background:var(--bad-dot)}
.button{display:inline-flex;align-items:center;justify-content:center;gap:.5rem;min-height:44px;padding:.625rem 1.25rem;border:1px solid var(--action);border-radius:999px;background:var(--action);color:var(--on-action);font:inherit;font-weight:600;line-height:1.25;text-align:center;text-decoration:none;cursor:pointer}
.button:hover{background:var(--action-pressed);border-color:var(--action-pressed)}
.button.secondary{background:var(--canvas);border-color:var(--input);color:var(--ink)}
.button.secondary:hover{background:var(--surface)}
.row{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center;margin-top:.75rem}
.notice{background:var(--good-fill);border-color:var(--good-fill);color:var(--good-ink)}
.notice.bad{background:var(--bad-fill);border-color:var(--bad-fill);color:var(--bad-ink)}
.notice h2{margin:0}.notice p{margin:.25rem 0 0}
.notice a{color:inherit}
.days li{background:var(--sky-fill);color:var(--sky-ink);border-radius:10px;padding:.75rem .9rem;margin:0}
.days li p{color:var(--sky-ink);margin:.25rem 0 0}
.days li:not(:last-child){margin-bottom:1.4rem;position:relative}
.days li:not(:last-child)::after{content:"\\2193";position:absolute;left:0;right:0;bottom:-1.4rem;height:1.4rem;line-height:1.4rem;text-align:center;color:var(--sky-ink)}
.pay{display:flex;flex-wrap:wrap;gap:1rem;align-items:center}
.pay p{margin:.5rem 0 0}
p+.pay,h3+.pay{margin-top:.75rem}
.qr{flex:none;width:10rem;height:10rem}
.qr svg{display:block;width:100%;height:100%;border-radius:8px}
label{display:block;margin:1rem 0 .375rem;font-weight:500}
input[type=text],input[type=tel],input[type=date],input[type=number],input:not([type]),select,textarea{display:block;width:100%;min-height:44px;padding:.625rem .75rem;border:1px solid var(--input);border-radius:6px;background:var(--canvas);color:var(--ink);font:inherit}
select{appearance:none;padding-right:2.5rem;background-image:linear-gradient(45deg,transparent 50%,var(--muted) 50%),linear-gradient(135deg,var(--muted) 50%,transparent 50%);background-position:calc(100% - 22px) 55%,calc(100% - 16px) 55%;background-size:6px 6px;background-repeat:no-repeat}
textarea{min-height:6rem;resize:vertical}
input[type=file]{display:block;max-width:100%;font:inherit;font-size:.9375rem}
.tick{display:flex;gap:.75rem;align-items:flex-start;margin:1rem 0;font-weight:400}
.tick input{width:1.5rem;height:1.5rem;flex:none;margin:0;accent-color:var(--action)}
fieldset{border:0;padding:0;margin:1rem 0 0}legend{font-weight:500;padding:0;margin-bottom:.375rem}
details>summary{list-style:none;cursor:pointer;min-height:44px;display:flex;align-items:center;font-weight:600}
details>summary::-webkit-details-marker{display:none}
details.fold>summary,.fold>details>summary{gap:.75rem}
details.fold>summary::after,.fold>details>summary::after{content:"";flex:none;margin:0 .25rem 0 auto;width:.5rem;height:.5rem;border-right:2px solid var(--muted);border-bottom:2px solid var(--muted);transform:translateY(-25%) rotate(45deg)}
details.fold[open]>summary::after,.fold>details[open]>summary::after{transform:translateY(25%) rotate(225deg)}
section.fold{padding-top:.25rem;padding-bottom:.25rem}
section.fold h2{margin:0}
section.fold details[open]{padding-bottom:.75rem}
.claim{margin-top:.25rem}
.claim form{background:var(--surface);border-radius:10px;padding:.25rem 1rem 1rem;margin-top:.75rem}
.claim form .row{margin-top:1rem}
input[type=file]::file-selector-button{min-height:44px;margin-right:.75rem;padding:0 1rem;border:1px solid var(--input);border-radius:999px;background:var(--canvas);color:var(--ink);font:inherit;font-weight:600;cursor:pointer}
.progress{height:6px;border-radius:999px;background:var(--hairline);overflow:hidden;margin:.75rem 0 .25rem}
.progress span{display:block;height:100%;border-radius:inherit;background:var(--money)}
.money{color:var(--money)}
.sr{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
.bar{position:fixed;left:0;right:0;bottom:0;z-index:10;background:var(--canvas);border-top:1px solid var(--hairline);padding:.75rem 1rem calc(.75rem + env(safe-area-inset-bottom))}
.bar .button{width:100%}
.with-bar main{padding-bottom:6.5rem}
html:has(:is(input,select,textarea):focus) .bar{display:none}
html.with-bar{scroll-padding-bottom:5.5rem}
@media (min-width:48rem){
main{padding:3rem 1.5rem 4rem}
h1{font-size:2.5rem}
section{padding:1.25rem 1.5rem;margin-top:1rem}
.bar{display:none}
.with-bar main{padding-bottom:4rem}
html.with-bar{scroll-padding-bottom:0}
}
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

/** The headers of a customer page: nothing loads but its own style, fonts and, when it has one, its script; no framing. */
export function securityHeaders(security: PageSecurity): Record<string, string> {
  const script = security.nonce === undefined ? "" : ` script-src 'nonce-${security.nonce}';`;
  const connect =
    security.nonce === undefined || !security.storageOrigin ? "" : ` connect-src 'self' ${security.storageOrigin};`;
  return {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Security-Policy": `default-src 'none'; style-src 'unsafe-inline'; font-src 'self';${script}${connect} base-uri 'none'; form-action ${security.forms ? "'self'" : "'none'"}; frame-ancestors 'none'`,
  };
}

/** The document around a page's body, with the page's own styles after the shared ones and a phone's bar after it. */
export function document(input: {
  title: string;
  agencyName: string;
  body: string;
  styles?: string;
  bar?: string;
  script?: { nonce: string; code: string };
}): string {
  const bar = input.bar ?? "";
  return `<!doctype html>
<html lang="en"${bar === "" ? "" : ' class="with-bar"'}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(input.title)} · ${escapeHtml(input.agencyName)}</title>
<style>${styles()}${input.styles ?? ""}</style>
</head>
<body><main>
${input.body}
</main>${bar}${input.script === undefined ? "" : `<script nonce="${input.script.nonce}">${input.script.code}</script>`}</body>
</html>`;
}

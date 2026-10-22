// What the website form's journeys share (plan F1): turning a form on through the api as its Owner, a visitor's browser (a
// second signed-out context on the project's kind of device, with Turnstile's script stood in for), and direct requests to
// the api for the checks that are about the wire: an address in X-Forwarded-For, a status, a body.
import { randomInt, randomUUID } from "node:crypto";
import { expect, type APIRequestContext, type Browser, type BrowserContext, type Page } from "@playwright/test";
import type { LeadListItem, LeadListPage, TimelinePage } from "@travel-crm/contracts/crm";
import type { SaveWebsiteFormInput, WebsiteFormView, WebsiteFormPublic } from "@travel-crm/contracts/website-forms";
import { turnstileScript, turnstileTokenFor, type TurnstileAnswer } from "./fake-turnstile";
import { callApi, anotherPersonsDevice } from "./leads";

const CLOUDFLARE_SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js";

function environment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set: run the journeys with \`pnpm --filter @travel-crm/web e2e\``);
  return value;
}

/** The api's own address, for requests that skip the web app's rewrite (and so carry the headers the test sets). */
export const apiUrl = (): string => environment("E2E_API_URL");
export const webUrl = (): string => environment("E2E_BASE_URL");

/** What a new form starts with in these journeys: embedding on, every optional question optional, no words of its own. */
export const defaultSettings: SaveWebsiteFormInput = {
  allowEmbed: true,
  emailMode: "optional",
  destinationMode: "optional",
  travelMonthMode: "optional",
  travellersMode: "optional",
  budgetMode: "optional",
  messageMode: "optional",
  offersTickbox: false,
  heading: null,
  introduction: null,
  thankYouMessage: null,
  websiteUrl: null,
  websiteButtonText: null,
  privacyUrl: null,
};

/** Saves the form with `changes` and turns it on, as the signed-in Owner; the view has its key and links. */
export async function turnOnForm(page: Page, changes: Partial<SaveWebsiteFormInput> = {}): Promise<WebsiteFormView> {
  await callApi(page, "websiteForm.save", { ...defaultSettings, ...changes });
  return callApi<WebsiteFormView>(page, "websiteForm.turnOn", {});
}

/** The form's key, which every view of a saved form has. */
export function keyOf(view: WebsiteFormView): string {
  if (view.key === null) throw new Error("the form has no key yet");
  return view.key;
}

/**
 * Makes the context answer Cloudflare's script with the fake's: every token the page's widget makes is judged as `answer`
 * by the fake siteverify. window.__turnstile counts renders and resets.
 */
export async function stubTurnstile(context: BrowserContext, answer: TurnstileAnswer = "pass"): Promise<void> {
  await context.route(CLOUDFLARE_SCRIPT, (route) =>
    route.fulfill({ contentType: "application/javascript", body: turnstileScript(answer) }),
  );
}

/** How many times the page's widget was reset (a spent token asks for a new one). */
export function widgetResets(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __turnstile?: { resets: number } }).__turnstile?.resets ?? 0);
}

/** A visitor's browser: signed out, with no cookies of the agency's, on the project's kind of device. */
export async function visitorsDevice(browser: Browser, answer: TurnstileAnswer = "pass"): Promise<BrowserContext> {
  const context = await anotherPersonsDevice(browser);
  await stubTurnstile(context, answer);
  return context;
}

/** Opens the hosted form of `key` in a new page of `context`. */
export async function openHosted(context: BrowserContext, key: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`/f/${key}`);
  return page;
}

/** A phone number nobody used yet in this run: 98 and eight random digits, typed the way a visitor writes one. */
export function newPhone(): string {
  return `98${String(randomInt(10_000_000, 99_999_999))}`;
}

/** What a visitor fills in on the hosted page. */
export async function fillVisitor(page: Page, { name, phone }: { name: string; phone: string }): Promise<void> {
  await page.getByLabel("Your name", { exact: true }).fill(name);
  await page.getByLabel("Phone", { exact: true }).fill(phone);
}

/** Presses Send enquiry and waits for the thank-you's heading. */
export async function sendAndExpectThanks(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Send enquiry" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Thank you" })).toBeVisible();
}

/**
 * The headers of a visitor whose address the api reads with PUBLIC_FORM_PROXY_HOPS=1: the visitor, then the one entry our own
 * proxy would add. `visitor` is any address a test makes up; each test makes its own so address limits never meet.
 */
export function viaProxy(visitor: string, forged?: string): Record<string, string> {
  const entries = [...(forged === undefined ? [] : [forged]), visitor, "198.51.100.1"];
  return { "x-forwarded-for": entries.join(", ") };
}

/** An address from the documentation range 203.0.113.0/24 no other test of this run is likely to use. */
export function newAddress(): string {
  return `203.0.${String(randomInt(0, 255))}.${String(randomInt(1, 255))}`;
}

export interface OpenedForm {
  form: WebsiteFormPublic;
  openedToken: string;
}

/** The public GET, direct to the api. A form for a visitor to fill gives its opened token; a closed one has none. */
export async function getForm(
  request: APIRequestContext,
  key: string,
  { headers = {}, via = "hosted" }: { headers?: Record<string, string>; via?: "hosted" | "embedded" } = {},
) {
  return request.get(`${apiUrl()}/api/public/website-forms/${key}?via=${via}`, { headers });
}

/**
 * Opens the form direct to the api and waits out the two seconds a person needs to fill it (W37), so what the test sends next
 * is not "too fast". The token it gives is good for a day, so a test may send many enquiries with it.
 */
export async function openForm(
  request: APIRequestContext,
  key: string,
  options: { headers?: Record<string, string>; via?: "hosted" | "embedded" } = {},
): Promise<OpenedForm> {
  const response = await getForm(request, key, options);
  expect(response.status(), await response.text()).toBe(200);
  const form = (await response.json()) as WebsiteFormPublic;
  if (!form.available) throw new Error("the form is closed");
  await new Promise((resolve) => setTimeout(resolve, 2_200));
  return { form, openedToken: form.form.openedToken };
}

export interface DirectEnquiry {
  name?: string;
  phone?: string;
  email?: string;
  message?: string;
  submissionId?: string;
  homepage?: string;
  openedToken: string;
  via?: "hosted" | "embedded";
  /** Left out, the token is one the fake Turnstile passes. */
  turnstileToken?: string | null;
  offers?: boolean;
  answers?: Record<string, unknown>;
}

/** The body of a visitor's enquiry as the contract has it, with what the test does not name made up. */
export function enquiryBody(enquiry: DirectEnquiry): Record<string, unknown> {
  const answers = {
    name: enquiry.name ?? "Meera Pillai",
    phone: enquiry.phone ?? newPhone(),
    ...(enquiry.email === undefined ? {} : { email: enquiry.email }),
    ...(enquiry.message === undefined ? {} : { message: enquiry.message }),
    ...(enquiry.offers === undefined ? {} : { offers: enquiry.offers }),
    ...enquiry.answers,
  };
  const token = enquiry.turnstileToken === undefined ? turnstileTokenFor("pass") : enquiry.turnstileToken;
  return {
    submissionId: enquiry.submissionId ?? randomUUID(),
    openedToken: enquiry.openedToken,
    via: enquiry.via ?? "hosted",
    homepage: enquiry.homepage ?? "",
    ...(token === null ? {} : { turnstileToken: token }),
    answers,
  };
}

/** The public POST, direct to the api, from the web app's own origin as a browser sends it. */
export async function postEnquiry(
  request: APIRequestContext,
  key: string,
  enquiry: DirectEnquiry,
  headers: Record<string, string> = {},
) {
  return request.post(`${apiUrl()}/api/public/website-forms/${key}/enquiries`, {
    data: enquiryBody(enquiry),
    headers: { origin: webUrl(), ...headers },
  });
}

const leadStages = ["open", "won", "lost", "not_a_lead"] as const;

/** Every lead the signed-in Owner can see, open or closed, newest first within each group. */
export async function leadsOf(page: Page): Promise<LeadListItem[]> {
  const items: LeadListItem[] = [];
  for (const stage of leadStages) {
    const found = await callApi<LeadListPage>(page, "leads.list", { view: "everyone", stage, limit: 50 });
    items.push(...found.items);
  }
  return items;
}

/** The leads of one visitor, by the phone they typed. */
export async function leadsOfPhone(page: Page, phone: string): Promise<LeadListItem[]> {
  const digits = phone.replaceAll(/\D/g, "").slice(-10);
  return (await leadsOf(page)).filter((lead) => (lead.person.phone ?? "").endsWith(digits));
}

export function timelineOf(page: Page, leadId: string): Promise<TimelinePage> {
  return callApi<TimelinePage>(page, "leads.timeline", { leadId });
}

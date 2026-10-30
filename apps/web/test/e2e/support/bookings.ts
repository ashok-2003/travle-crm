// What the bookings journeys start from (release 6): a lead with a sent quote (made through the api, so every rule runs), the
// customer accepting it on its link as a visitor does, and the booking the worker makes from that, waited for.
import { expect, type Browser, type Page } from "@playwright/test";
import { addLeadThroughApi, callApi, dayInIndia, leadInput } from "./leads";

export interface AcceptedQuote {
  leadId: string;
  quoteId: string;
  bookingId: string;
  /** The customer's link, as they open it. */
  link: string;
}

interface BookingSummary {
  id: string;
  customerName: string;
  status: string;
}

/** A quote of `total` rupees for `name` leaving in `days` days, sent as a link. */
export async function sentQuote(
  page: Page,
  options: { name: string; phone: string; title?: string; totalRupees?: number; days?: number; adults?: number } = {
    name: "Rahul Sharma",
    phone: "+919876543210",
  },
): Promise<{ leadId: string; quoteId: string; link: string }> {
  const leadId = await addLeadThroughApi(page, leadInput({ person: { name: options.name, phone: options.phone } }));
  const quote = await callApi<{ id: string }>(page, "quotes.create", {
    leadId,
    title: options.title ?? "Spiti in winter",
    startDate: dayInIndia(options.days ?? 40),
    adults: options.adults ?? 2,
    children: 0,
    days: [
      { title: "Arrive in Kaza", description: "Check in and rest" },
      { title: "Key monastery and Kibber", description: "" },
    ],
    items: [
      {
        description: "Package per adult",
        detail: "",
        quantity: options.adults ?? 2,
        unitPricePaise: Math.round(((options.totalRupees ?? 100_000) * 100) / (options.adults ?? 2)),
      },
    ],
    inclusions: "",
    exclusions: "",
    notes: "",
    taxRateBasisPoints: 0,
    placeOfSupply: null,
  });
  const shared = await callApi<{ path: string }>(page, "quotes.share", { quoteId: quote.id });
  const origin = new URL(page.url() === "about:blank" ? (process.env.E2E_BASE_URL ?? "") : page.url()).origin;
  return { leadId, quoteId: quote.id, link: `${origin}${shared.path}` };
}

/** The customer accepts on the link in a browser of their own, agreeing to trip updates on WhatsApp. */
export async function acceptOnTheLink(browser: Browser, link: string, name: string): Promise<void> {
  const customer = await browser.newPage();
  await customer.goto(link);
  await customer.getByLabel("Your name").fill(name);
  await customer.getByLabel(/I agree to the terms/).check();
  await customer.getByLabel("Send me trip updates on WhatsApp").check();
  await customer.getByRole("button", { name: "Accept quote" }).click();
  await expect(customer.getByText("Thank you, your acceptance is recorded")).toBeVisible();
  await customer.close();
}

/** Waits for the worker to make the customer's booking, and gives its id. */
export async function bookingOf(page: Page, customerName: string): Promise<string> {
  let found: string | undefined;
  await expect
    .poll(
      async () => {
        const list = await callApi<{ items: BookingSummary[] }>(page, "bookings.list", {});
        found = list.items.find((booking) => booking.customerName === customerName)?.id;
        return found;
      },
      { timeout: 30_000 },
    )
    .toBeDefined();
  if (found === undefined) throw new Error("no booking");
  return found;
}

/** A lead, its quote accepted on the link, and the booking made from it, still waiting for the agency. */
export async function acceptedQuote(
  page: Page,
  browser: Browser,
  options: Parameters<typeof sentQuote>[1] = { name: "Rahul Sharma", phone: "+919876543210" },
): Promise<AcceptedQuote> {
  const sent = await sentQuote(page, options);
  await acceptOnTheLink(browser, sent.link, options.name);
  return { ...sent, bookingId: await bookingOf(page, options.name) };
}

// What the departures journeys start from (release 7a): a batch made through the api, a lead to hold seats for, and a booking
// on the batch (the lead's quote put on it, accepted on its link as a visitor does, the booking the worker makes waited for).
import { expect, type Browser, type Page } from "@playwright/test";
import { acceptOnTheLink, bookingOf } from "./bookings";
import { addLeadThroughApi, callApi, dayInIndia, leadInput } from "./leads";

/** A day yyyy-mm-dd as a date input shows it. */
export const inputDay = (day: string): string => day.split("-").reverse().join("/");

export async function aDeparture(
  page: Page,
  options: { title?: string; startInDays?: number; nights?: number; seats?: number; priceRupees?: number } = {},
): Promise<string> {
  const start = options.startInDays ?? 10;
  const { id } = await callApi<{ id: string }>(page, "departures.create", {
    title: options.title ?? "Kedarnath batch",
    destinationId: null,
    startDate: dayInIndia(start),
    endDate: dayInIndia(start + (options.nights ?? 4)),
    seatsTotal: options.seats ?? 20,
    pricePaise: options.priceRupees === undefined ? null : options.priceRupees * 100,
    cutoffOn: null,
    notes: "",
  });
  return id;
}

export async function aLead(page: Page, name: string, phone: string): Promise<string> {
  return addLeadThroughApi(page, leadInput({ person: { name, phone } }));
}

/** A lead's quote on the departure, accepted on its link: the booking the worker makes, waited for. */
export async function bookedOn(
  page: Page,
  browser: Browser,
  departureId: string,
  options: { name: string; phone: string; adults: number },
): Promise<{ leadId: string; quoteId: string; bookingId: string }> {
  const leadId = await aLead(page, options.name, options.phone);
  const quote = await callApi<{ id: string }>(page, "quotes.create", {
    leadId,
    title: "Kedarnath yatra",
    startDate: dayInIndia(10),
    adults: options.adults,
    children: 0,
    days: [{ title: "Day 1", description: "" }],
    items: [{ description: "Package", detail: "", quantity: options.adults, unitPricePaise: 1_000_000 }],
    inclusions: "",
    exclusions: "",
    notes: "",
    taxRateBasisPoints: 0,
    placeOfSupply: null,
  });
  await callApi(page, "departures.setQuoteDeparture", { quoteId: quote.id, departureId });
  const shared = await callApi<{ path: string }>(page, "quotes.share", { quoteId: quote.id });
  await acceptOnTheLink(
    browser,
    `${new URL(page.url() === "about:blank" ? (process.env.E2E_BASE_URL ?? "") : page.url()).origin}${shared.path}`,
    options.name,
  );
  const bookingId = await bookingOf(page, options.name);
  expect(bookingId).toBeTruthy();
  return { leadId, quoteId: quote.id, bookingId };
}

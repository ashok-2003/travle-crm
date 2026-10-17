// What the lead journeys and the camera start from (R54): leads made through the api as the signed-in person, so every
// rule runs (known contacts, owners, the timeline, the audit), never by writing rows; a lead's input with only what a
// journey says, the rest not asked yet; follow-ups and stage moves the same way; an agency with a salesperson, Ravi,
// beside its Owner; and a second person's browser on the journey's own kind of device.
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import type { CreateLeadInput, LeadStage } from "@travel-crm/contracts/crm";
import type { Agency, Staff } from "./fixtures";

/** The web app's address: the api accepts changes only from its own origin, which a browser would send. */
function appOrigin(): string {
  const origin = process.env.E2E_BASE_URL;
  if (!origin) throw new Error("E2E_BASE_URL is not set: run the journeys with `pnpm --filter @travel-crm/web e2e`");
  return origin;
}

interface Answered<T> {
  result: { data: T };
}

/** Calls an api procedure as the page's signed-in person, as the app does (every call a POST), and gives its data. */
export async function callApi<T>(page: Page, path: string, input: unknown): Promise<T> {
  const response = await page.request.post(`/api/trpc/${path}`, {
    data: input ?? {},
    headers: { origin: appOrigin() },
  });
  expect(response.ok(), `${path} answered ${String(response.status())}: ${await response.text()}`).toBe(true);
  return ((await response.json()) as Answered<T>).result.data;
}

/** A lead's input: a name and a phone from a phone call, nothing else asked yet, unless the journey says. */
export function leadInput(
  changes: Partial<Omit<CreateLeadInput, "trip">> & { trip?: Partial<CreateLeadInput["trip"]> } = {},
): CreateLeadInput {
  const { trip, ...rest } = changes;
  return {
    person: { name: "Rahul Sharma", phone: "+919876543210" },
    note: null,
    source: "phone_call",
    sourceDetail: null,
    ownerUserId: null,
    whenOpenLead: null,
    ...rest,
    trip: {
      destination: null,
      when: { kind: "unknown" },
      adults: null,
      childrenAges: [],
      budget: null,
      departureCity: null,
      tripType: null,
      hotelCategory: null,
      food: null,
      roomType: null,
      ...trip,
    },
  };
}

/** Adds a lead through the api as the signed-in person, as the new-lead form does, and gives its id. */
export async function addLeadThroughApi(page: Page, input: CreateLeadInput): Promise<string> {
  const created = await callApi<{ leadId: string | null }>(page, "leads.create", input);
  if (created.leadId === null) throw new Error("the lead went to one the person can't see");
  return created.leadId;
}

/** A follow-up on the lead, due `on` (yyyy-mm-dd) `at` (HH:MM) on the agency's clock, for its owner. */
export async function addFollowUpThroughApi(
  page: Page,
  leadId: string,
  { title, on, at }: { title: string; on: string; at: string },
): Promise<void> {
  await callApi(page, "leads.addWork", { leadId, kind: "follow-up", title, due: { on, at } });
}

export async function moveStageThroughApi(page: Page, leadId: string, stage: LeadStage): Promise<void> {
  await callApi(page, "leads.moveStage", { leadId, stage });
}

/** A day `days` from today in India (yyyy-mm-dd), the test agency's zone. */
export function dayInIndia(days = 0): string {
  const day = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(day);
}

/** The id of the lead worker named `name`, as leads.owners lists them to the signed-in Owner. */
function workerId(workers: { userId: string; name: string }[], name: string): string {
  const userId = workers.find((worker) => worker.name === name)?.userId;
  if (userId === undefined) throw new Error(`${name} isn't among the people who can work leads`);
  return userId;
}

/** The agency's people who work leads, with their ids: its Owner and Ravi Kumar, a salesperson (starter role Sales). */
export async function leadWorkerAgency(
  page: Page,
  {
    agency,
    addStaff,
  }: { agency: Agency; addStaff: (options: { name: string; username: string; roleKey: string }) => Promise<Staff> },
): Promise<{ owner: Agency["owner"] & { userId: string }; ravi: Staff & { userId: string } }> {
  const ravi = await addStaff({ name: "Ravi Kumar", username: "ravi", roleKey: "sales" });
  const workers = await callApi<{ userId: string; name: string }[]>(page, "leads.owners", {});
  return {
    owner: { ...agency.owner, userId: workerId(workers, agency.owner.name) },
    ravi: { ...ravi, userId: workerId(workers, ravi.name) },
  };
}

/** A second person's browser on the same kind of device as the journey's project (a phone, or a desktop). */
export async function anotherPersonsDevice(browser: Browser): Promise<BrowserContext> {
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = test.info().project.use;
  return browser.newContext({
    baseURL: appOrigin(),
    ...(viewport && { viewport }),
    ...(userAgent !== undefined && { userAgent }),
    ...(deviceScaleFactor !== undefined && { deviceScaleFactor }),
    ...(isMobile !== undefined && { isMobile }),
    ...(hasTouch !== undefined && { hasTouch }),
  });
}

// What the assignment journeys share (release 4): an agency with two salespeople beside its Owner, the settings saved
// through the api as the Owner, and website enquiries sent the way a visitor's browser sends them, each from an address
// of its own so no limit is met, with the lead each one made read back.
import { expect, type APIRequestContext, type Page } from "@playwright/test";
import type { LeadListItem, SaveAssignmentInput } from "@travel-crm/contracts/crm";
import type { Agency, Staff } from "./fixtures";
import { callApi } from "./leads";
import { keyOf, leadsOfPhone, newAddress, newPhone, openForm, postEnquiry, turnOnForm, viaProxy } from "./website-form";

type AddStaff = (options: { name: string; username: string; roleKey: string }) => Promise<Staff>;

export interface Team {
  owner: { userId: string; name: string };
  priya: Staff & { userId: string };
  ravi: Staff & { userId: string };
  /** Names by user id, to read an owner back as a person. */
  nameOf: (userId: string | null) => string;
}

/** The Owner and two salespeople, Priya Nair and Ravi Kumar, with their user ids. */
export async function salesTeam(page: Page, agency: Agency, addStaff: AddStaff): Promise<Team> {
  const priya = await addStaff({ name: "Priya Nair", username: "priya", roleKey: "sales" });
  const ravi = await addStaff({ name: "Ravi Kumar", username: "ravi", roleKey: "sales" });
  const workers = await callApi<{ userId: string; name: string }[]>(page, "leads.owners", {});
  const idOf = (name: string) => {
    const found = workers.find((worker) => worker.name === name);
    if (!found) throw new Error(`${name} is not among the people who work leads`);
    return found.userId;
  };
  const people = { owner: agency.owner.name, priya: priya.name, ravi: ravi.name };
  return {
    owner: { userId: idOf(people.owner), name: people.owner },
    priya: { ...priya, userId: idOf(people.priya) },
    ravi: { ...ravi, userId: idOf(people.ravi) },
    nameOf: (userId) => workers.find((worker) => worker.userId === userId)?.name ?? "nobody",
  };
}

/** The settings as a new agency has them, with what a journey changes. */
export function settings(changes: Partial<SaveAssignmentInput> = {}): SaveAssignmentInput {
  return {
    mode: "owner",
    slowReplyMinutes: null,
    workdays: 127,
    opensMinute: 0,
    closesMinute: 1440,
    rules: [],
    pool: [],
    ...changes,
  };
}

export async function saveSettings(page: Page, changes: Partial<SaveAssignmentInput>): Promise<void> {
  await callApi(page, "assignment.save", settings(changes));
}

/** Turns the website form on and gives something that sends enquiries to it. */
export async function websiteVisitors(page: Page, request: APIRequestContext) {
  const key = keyOf(await turnOnForm(page));
  const from = () => viaProxy(newAddress());
  const { openedToken } = await openForm(request, key, { headers: from() });
  return {
    /** Sends one enquiry and gives the lead it made, as the Owner sees it. */
    async enquire(enquiry: { name?: string; phone?: string; answers?: Record<string, unknown> } = {}) {
      const phone = enquiry.phone ?? newPhone();
      const response = await postEnquiry(request, key, { ...enquiry, phone, openedToken }, from());
      expect(response.status(), await response.text()).toBe(201);
      return leadOf(page, phone);
    },
  };
}

/** The lead a visitor's phone made, waiting for the worker if the lead is not yet there. */
async function leadOf(page: Page, phone: string): Promise<LeadListItem> {
  let found: LeadListItem | undefined;
  await expect(async () => {
    [found] = await leadsOfPhone(page, phone);
    expect(found).toBeDefined();
  }).toPass({ timeout: 15_000 });
  if (!found) throw new Error("no lead");
  return found;
}

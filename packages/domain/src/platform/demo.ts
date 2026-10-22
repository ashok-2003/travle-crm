// The shared demo organization (spec 7.4: "one shared demo with realistic sample data, reset nightly by a job"). The
// console's nightly job purges last night's demo and builds it again: its business profile, the starter roles, and
// staff in three roles who sign in with its code, their username and the demo password, on the demo's own plan, which
// is never for sale. The modules that keep leads, quotes and bookings add their sample data here: crm's leads for the
// Owner (Asha) and the salesperson (Ravi), timed from the reset.
import { saveOrganizationProfileInput } from "@travel-crm/contracts/profile";
import { saveWebsiteFormInput } from "@travel-crm/contracts/website-forms";
import { asOrganization, type PlatformTx } from "@travel-crm/db/platform";
import { addDemoLeads } from "../crm/index.js";
import {
  addStaffWithPassword,
  createOrganizationRecord,
  findOrganizationByCode,
  insertStarterRoles,
  OWNER_ROLE_KEY,
} from "../identity/index.js";
import { addDays, calendarDateIn, DomainError, systemActor } from "../kernel/index.js";
import { saveOrganizationProfile } from "../profile/index.js";
import { demoPlan, startSubscription } from "../subscriptions/index.js";
import { saveWebsiteForm } from "../website-forms/index.js";
import { hashPassword } from "./password-hash.js";
import { recordPlatformAudit } from "./platform-log.js";
import { purgeOrganization } from "./purge.js";
import type { PlatformServices } from "./services.js";

export const RESET_DEMO_QUEUE = "platform.reset-demo";

export interface DemoSettings {
  /** The demo's organization code, e.g. DEMO: everyone signs in with it. */
  code: string;
  /** Every demo account's password. */
  password: string;
}

const TIME_ZONE = "Asia/Kolkata";

/** Paid a month ahead from the day it is built: reset nightly, it never reaches past due. */
const PAID_DAYS = 30;

/** Who signs in to the demo, with its code and the demo password. */
export const demoStaff = [
  { name: "Asha Mehta", username: "asha", roleKey: OWNER_ROLE_KEY },
  { name: "Ravi Kumar", username: "ravi", roleKey: "sales" },
  { name: "Meena Iyer", username: "meena", roleKey: "operations" },
] as const;

/** Checked by the same rules as an Owner's own save. */
const DEMO_PROFILE = saveOrganizationProfileInput.parse({
  legalName: "Demo Holidays Private Limited",
  gstin: "27AAPFU0939F1ZV",
  gstStateCode: "27",
  address: "4th floor, Sea View Chambers, Linking Road, Bandra West, Mumbai 400050",
  contactName: "Asha Mehta",
  // The owner's own number, as on the demo's one customer with a phone: no demo screen shows a stranger's.
  contactPhone: "+918538953742",
  bankAccountName: "Demo Holidays Private Limited",
  bankAccountNumber: "000123456789",
  bankIfsc: "HDFC0000001",
  bankName: "HDFC Bank",
  invoicePrefix: "DH",
  brandColour: "#1f6f5c",
  documentTerms: "50% advance to confirm, the balance 15 days before travel.",
});

/** The demo's website form: the defaults, with a sample thank-you. */
const DEMO_FORM = saveWebsiteFormInput.parse({
  allowEmbed: true,
  emailMode: "optional",
  destinationMode: "optional",
  travelMonthMode: "optional",
  travellersMode: "optional",
  budgetMode: "off",
  messageMode: "optional",
  offersTickbox: false,
  heading: null,
  introduction: null,
  thankYouMessage: "Thank you! We will call you within a few hours to plan your trip.",
  websiteUrl: null,
  websiteButtonText: null,
  privacyUrl: null,
});

const DEMO_AGENCY_NAME = "Demo Holidays";

/**
 * Purges the organization last night's reset built, then builds the demo again; the first run only builds it. Both
 * checks come before the purge: an organization with the demo's code that no reset built is never touched (a code set
 * by mistake can't purge an agency), and a plan for sale that took the demo plan's key leaves last night's demo as it
 * is (DEMO_PLAN_KEY_TAKEN).
 */
export async function resetDemoOrganization(
  services: PlatformServices,
  demo: DemoSettings,
  now: Date = new Date(),
): Promise<{ organizationId: string }> {
  const { lastNight, plan } = await services.platformDb.transaction(async (tx) => ({
    lastNight: await lastDemo(tx, demo.code),
    plan: await demoPlan(tx),
  }));
  if (lastNight !== null) {
    // The demo is active, never cancelled: the purge's own check is for agencies, and lastDemo made sure of this one.
    await purgeOrganization(services, { organizationId: lastNight, requestedBy: null }, { requireCancelled: false });
  }
  // Hashing is slow on purpose: once, before the transaction, for every demo account.
  const passwordHash = await hashPassword(services, demo.password);
  return services.platformDb.transaction(
    async (tx) => {
      const organization = await createOrganizationRecord(tx, {
        name: DEMO_AGENCY_NAME,
        code: demo.code,
        timeZone: TIME_ZONE,
        contactEmail: null,
      });
      const actor = systemActor(organization.id);
      await asOrganization(tx, organization.id, async (orgTx) => {
        await insertStarterRoles(orgTx);
        await saveOrganizationProfile(orgTx, actor, DEMO_PROFILE);
        const userIds = new Map<string, string>();
        for (const staff of demoStaff) {
          userIds.set(staff.username, (await addStaffWithPassword(orgTx, actor, { ...staff, passwordHash })).userId);
        }
        const [ownerUserId, salesUserId] = [userIds.get("asha"), userIds.get("ravi")];
        if (ownerUserId === undefined || salesUserId === undefined) throw new Error("The demo's staff were not added");
        // The form is off and stays off: the demo is never open to the public (F14), whatever its switch says.
        const form = await saveWebsiteForm(orgTx, actor, DEMO_FORM);
        await addDemoLeads(orgTx, actor, { ownerUserId, salesUserId }, form.id, DEMO_AGENCY_NAME, now);
      });
      await startSubscription(
        tx,
        { userId: null },
        {
          organizationId: organization.id,
          planId: plan.id,
          billingCycle: "monthly",
          trialEndsOn: null,
          paidThrough: addDays(calendarDateIn(now, TIME_ZONE), PAID_DAYS),
        },
        now,
      );
      await recordPlatformAudit(
        tx,
        { userId: null },
        {
          action: "demo.reset",
          targetType: "organization",
          targetId: organization.id,
          targetOrganizationId: organization.id,
          after: { code: organization.code, planKey: plan.key },
        },
      );
      return { organizationId: organization.id };
    },
    // Three accounts, as onboarding, and the sample leads: a few hundred statements in all. Two minutes, so it also
    // finishes when run from an operator's computer far from the database (each statement a round trip away), or on a
    // host with a tenth of a CPU (docs/serverless.md); beside the database it takes seconds.
    { timeout: 120_000 },
  );
}

/** The organization with the demo's code, or null; refused when no demo reset built it. */
async function lastDemo(tx: PlatformTx, code: string): Promise<string | null> {
  const organization = await findOrganizationByCode(tx, code);
  if (organization === null) return null;
  const built = await tx.platformAuditEntry.findFirst({
    where: { action: "demo.reset", targetOrganizationId: organization.id },
    select: { id: true },
  });
  if (built === null) {
    throw new DomainError("CONFLICT", "DEMO_CODE_TAKEN", "An organization the demo reset didn't build has its code");
  }
  return organization.id;
}

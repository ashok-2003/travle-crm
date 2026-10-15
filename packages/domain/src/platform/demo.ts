// The shared demo organization (spec 7.4: "one shared demo with realistic sample data, reset nightly by a job"). The
// console's nightly job purges last night's demo and builds it again: its business profile, the starter roles, and
// staff in three roles who sign in with its code, their username and the demo password, on the demo's own plan, which
// is never for sale. The modules that keep leads, quotes and bookings add their sample data here when they arrive.
import { saveOrganizationProfileInput } from "@travel-crm/contracts/profile";
import { asOrganization, type PlatformTx } from "@travel-crm/db/platform";
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

const DEMO_STAFF = [
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
  contactPhone: "+91 98200 12345",
  bankAccountName: "Demo Holidays Private Limited",
  bankAccountNumber: "000123456789",
  bankIfsc: "HDFC0000001",
  bankName: "HDFC Bank",
  invoicePrefix: "DH",
  brandColour: "#1f6f5c",
  documentTerms: "50% advance to confirm, the balance 15 days before travel.",
});

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
  const passwordHash = await (await services.identity.auth.$context).password.hash(demo.password);
  return services.platformDb.transaction(
    async (tx) => {
      const organization = await createOrganizationRecord(tx, {
        name: "Demo Holidays",
        code: demo.code,
        timeZone: TIME_ZONE,
        contactEmail: null,
      });
      const actor = systemActor(organization.id);
      await asOrganization(tx, organization.id, async (orgTx) => {
        await insertStarterRoles(orgTx);
        await saveOrganizationProfile(orgTx, actor, DEMO_PROFILE);
        for (const staff of DEMO_STAFF) await addStaffWithPassword(orgTx, actor, { ...staff, passwordHash });
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
    // A dozen statements and three accounts, as onboarding.
    { timeout: 20_000 },
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

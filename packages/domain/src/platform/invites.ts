// The invite-only program (the owner, 2026-10-28): the console makes invites in bulk from a sheet's rows, one link
// each; a company's owner opens theirs and their organization is made at once (its row, roles and profile, its Owner,
// the plan's free days) and they are signed in, typing nothing. Every opening is counted; opened again, the link signs
// the Owner in until they choose their own password, then sends them to sign in as usual. Each invite and join is in
// the platform log; the organization's beginning is in its own audit log.
import { randomBytes } from "node:crypto";
import type { CreateVipInvitesInput, VipInvite, VipInviteList, VipInviteOpened } from "@travel-crm/contracts/platform";
import { gstStateCode } from "@travel-crm/contracts/kernel";
import { asOrganization, type PlatformTx } from "@travel-crm/db/platform";
import { recordAudit } from "../audit/index.js";
import {
  addInvitedOwner,
  createOrganizationRecord,
  insertStarterRoles,
  INVITED_OWNER_USERNAME,
  renewInvitedOwnerPassword,
} from "../identity/index.js";
import { addDays, calendarDateIn, DomainError, platformActor } from "../kernel/index.js";
import { saveOrganizationProfile } from "../profile/index.js";
import { startSubscription } from "../subscriptions/index.js";
import { markOrganizationBegun } from "../usage/index.js";
import { hashPassword } from "./password-hash.js";
import { recordPlatformAudit } from "./platform-log.js";
import type { PlatformServices } from "./services.js";

const TIME_ZONE = "Asia/Kolkata";
/** A join's dozen statements and the subscription; Prisma's default is 5 seconds. */
const JOIN_TIMEOUT_MS = 20_000;

const notFound = () => new DomainError("NOT_FOUND", "NOT_FOUND", "Not found");

/** The link to send: the web app's /vip/<token>. */
export const inviteUrl = (appUrl: string, token: string) => `${appUrl.replace(/\/$/, "")}/vip/${token}`;

function statusOf(row: { cancelledAt: Date | null; joinedAt: Date | null; openCount: number }): VipInvite["status"] {
  if (row.cancelledAt !== null) return "cancelled";
  if (row.joinedAt !== null) return "joined";
  return row.openCount > 0 ? "opened" : "sent";
}

/** Invites, one per row, on the plan and free days chosen; each in the platform log. */
export async function createVipInvites(
  services: PlatformServices,
  staff: { userId: string },
  input: CreateVipInvitesInput,
): Promise<{ created: number }> {
  return services.platformDb.transaction(async (tx) => {
    const plan = await tx.plan.findUnique({
      where: { id: input.planId },
      select: { archivedAt: true, forSale: true, monthlyPricePaise: true, yearlyPricePaise: true },
    });
    if (plan?.archivedAt !== null || !plan.forSale) throw notFound();
    const priced = input.billingCycle === "monthly" ? plan.monthlyPricePaise : plan.yearlyPricePaise;
    if (priced === null)
      throw new DomainError("VALIDATION", "PLAN_NOT_SOLD_THAT_WAY", "The plan isn't sold on that billing cycle");
    for (const row of input.rows) {
      const invite = await tx.vipInvite.create({
        data: {
          token: randomBytes(24).toString("base64url"),
          companyName: row.companyName,
          ownerName: row.ownerName,
          ownerPhone: row.ownerPhone,
          ownerEmail: row.ownerEmail,
          city: row.city,
          gstStateCode: input.gstStateCode,
          planId: input.planId,
          billingCycle: input.billingCycle,
          trialDays: input.trialDays,
          createdBy: staff.userId,
        },
        select: { id: true },
      });
      await recordPlatformAudit(tx, staff, {
        action: "invite.created",
        targetType: "vip_invite",
        targetId: invite.id,
        after: { planId: input.planId, trialDays: input.trialDays },
      });
    }
    return { created: input.rows.length };
  });
}

export async function listVipInvites(services: PlatformServices, appUrl: string): Promise<VipInviteList> {
  return services.platformDb.transaction(async (tx) => {
    const rows = await tx.vipInvite.findMany({
      orderBy: { createdAt: "desc" },
      take: 1000,
      include: { plan: { select: { name: true } } },
    });
    const items = rows.map((row) => ({
      id: row.id,
      companyName: row.companyName,
      ownerName: row.ownerName,
      ownerPhone: row.ownerPhone,
      ownerEmail: row.ownerEmail,
      city: row.city,
      url: inviteUrl(appUrl, row.token),
      status: statusOf(row),
      planName: row.plan.name,
      trialDays: row.trialDays,
      createdAt: row.createdAt.toISOString(),
      firstOpenedAt: row.firstOpenedAt?.toISOString() ?? null,
      lastOpenedAt: row.lastOpenedAt?.toISOString() ?? null,
      openCount: row.openCount,
      joinedAt: row.joinedAt?.toISOString() ?? null,
      organizationId: row.joinedOrganizationId,
    }));
    return {
      items,
      totals: {
        sent: items.filter((one) => one.status !== "cancelled").length,
        opened: items.filter((one) => one.openCount > 0).length,
        joined: items.filter((one) => one.status === "joined").length,
        opens: items.reduce((sum, one) => sum + one.openCount, 0),
      },
    };
  });
}

/** An invite not yet used stops working; logged. */
export async function cancelVipInvite(
  services: PlatformServices,
  staff: { userId: string },
  inviteId: string,
): Promise<void> {
  await services.platformDb.transaction(async (tx) => {
    const cancelled = await tx.vipInvite.updateMany({
      where: { id: inviteId, joinedAt: null, cancelledAt: null },
      data: { cancelledAt: new Date() },
    });
    if (cancelled.count === 0) throw notFound();
    await recordPlatformAudit(tx, staff, { action: "invite.cancelled", targetType: "vip_invite", targetId: inviteId });
  });
}

/** A sign-in code from the company's name: up to 7 of its letters and digits, then 4 digits. */
function codeFor(companyName: string): string {
  const letters = companyName
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 7);
  const digits = String(randomBytes(2).readUInt16BE() % 10_000).padStart(4, "0");
  return `${letters.length >= 2 ? letters : `VIP${letters}`}${digits}`.slice(0, 12);
}

async function freeCode(tx: PlatformTx, companyName: string): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = codeFor(companyName);
    if ((await tx.organization.findUnique({ where: { code }, select: { id: true } })) === null) return code;
  }
  throw new DomainError("CONFLICT", "ORGANIZATION_CODE_TAKEN", "No free code for this company");
}

/** The company's organization, made in the invite's transaction; its Owner signs in with the password given. */
async function join(
  tx: PlatformTx,
  invite: NonNullable<Awaited<ReturnType<PlatformTx["vipInvite"]["findUnique"]>>>,
  passwordHash: string,
  now: Date,
) {
  const organization = await createOrganizationRecord(tx, {
    name: invite.companyName,
    code: await freeCode(tx, invite.companyName),
    timeZone: TIME_ZONE,
    contactEmail: invite.ownerEmail,
  });
  const actor = platformActor(organization.id, invite.createdBy);
  const owner = await asOrganization(tx, organization.id, async (orgTx) => {
    await insertStarterRoles(orgTx);
    await saveOrganizationProfile(orgTx, actor, {
      legalName: invite.companyName,
      gstin: null,
      gstStateCode: gstStateCode.parse(invite.gstStateCode),
      contactName: invite.ownerName,
      contactPhone: invite.ownerPhone,
      address: null,
      bankAccountName: null,
      bankAccountNumber: null,
      bankIfsc: null,
      bankName: null,
      invoicePrefix: null,
      brandColour: null,
      documentTerms: null,
    });
    const created = await addInvitedOwner(orgTx, actor, {
      name: invite.ownerName,
      email: invite.ownerEmail,
      phone: invite.ownerPhone,
      passwordHash,
    });
    await markOrganizationBegun(orgTx, { vip: true, trialDays: invite.trialDays });
    await recordAudit(orgTx, actor, {
      action: "organization.onboarded",
      entityType: "organization",
      entityId: organization.id,
      after: { code: organization.code, via: "invite" },
    });
    return created;
  });
  const today = calendarDateIn(now, TIME_ZONE);
  await startSubscription(
    tx,
    { userId: invite.createdBy },
    {
      organizationId: organization.id,
      planId: invite.planId,
      billingCycle: invite.billingCycle === "yearly" ? "yearly" : "monthly",
      trialEndsOn: addDays(today, invite.trialDays - 1),
      paidThrough: null,
    },
    now,
  );
  await tx.vipInvite.update({
    where: { id: invite.id },
    data: { joinedOrganizationId: organization.id, joinedAt: now, ownerUserId: owner.userId },
  });
  await recordPlatformAudit(
    tx,
    { userId: null },
    {
      action: "invite.joined",
      targetType: "vip_invite",
      targetId: invite.id,
      targetOrganizationId: organization.id,
      after: { code: organization.code, planId: invite.planId, trialDays: invite.trialDays },
    },
  );
  return organization.code;
}

/**
 * An invite's link opened: counted, then the company's organization made and the Owner signed in (first time), the
 * Owner signed in again (until they choose their own password), or sent to sign in; a cancelled or unknown link is closed.
 */
export async function openVipInvite(
  services: PlatformServices,
  token: string,
  now: Date = new Date(),
): Promise<VipInviteOpened> {
  // Hashing is slow on purpose: before the transaction, never inside it.
  const password = randomBytes(24).toString("base64url");
  const passwordHash = await hashPassword(services, password);
  return services.platformDb.transaction(
    async (tx) => {
      const found = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM vip_invite WHERE token = ${token} FOR UPDATE`;
      const id = found[0]?.id;
      if (id === undefined) return { state: "closed" as const };
      const invite = await tx.vipInvite.findUnique({ where: { id } });
      if (invite?.cancelledAt !== null) return { state: "closed" as const };
      await tx.vipInviteOpen.create({ data: { inviteId: id, openedAt: now } });
      await tx.vipInvite.update({
        where: { id },
        data: {
          openCount: { increment: 1 },
          lastOpenedAt: now,
          ...(invite.firstOpenedAt === null ? { firstOpenedAt: now } : {}),
        },
      });
      const welcome = { companyName: invite.companyName, ownerName: invite.ownerName, trialDays: invite.trialDays };
      if (invite.joinedOrganizationId === null) {
        const orgCode = await join(tx, invite, passwordHash, now);
        return { state: "signIn" as const, orgCode, username: INVITED_OWNER_USERNAME, password, ...welcome };
      }
      const organization = await tx.organization.findUnique({
        where: { id: invite.joinedOrganizationId },
        select: { code: true },
      });
      if (organization === null || invite.ownerUserId === null) return { state: "closed" as const };
      const renewed = await asOrganization(tx, invite.joinedOrganizationId, (orgTx) =>
        renewInvitedOwnerPassword(orgTx, invite.joinedOrganizationId ?? "", invite.ownerUserId ?? "", passwordHash),
      );
      return renewed
        ? {
            state: "signIn" as const,
            orgCode: organization.code,
            username: INVITED_OWNER_USERNAME,
            password,
            ...welcome,
          }
        : { state: "joined" as const, orgCode: organization.code, companyName: invite.companyName };
    },
    { timeout: JOIN_TIMEOUT_MS },
  );
}

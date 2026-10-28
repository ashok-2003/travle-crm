// The invite-only program (the owner, 2026-10-28): invites the console makes in bulk from a sheet's rows (a company, its
// owner, the plan and the free days), each with its own link; how each link has done (opened when and how often, joined
// or not); and what opening one answers, for the web app to sign the owner in.
import { z } from "zod";
import { emailAddress, personName, recordId } from "../identity/index.js";
import { gstStateCode, phoneNumber } from "../kernel/index.js";
import { billingCycle } from "../subscriptions/index.js";

/** One company to invite, as a sheet's row gives it. */
export const vipInviteRow = z.strictObject({
  companyName: z.string().trim().min(1).max(120),
  ownerName: personName,
  ownerPhone: phoneNumber.nullable(),
  ownerEmail: emailAddress.nullable(),
  city: z.string().trim().max(80).nullable(),
});
export type VipInviteRow = z.infer<typeof vipInviteRow>;

export const createVipInvitesInput = z.strictObject({
  rows: z.array(vipInviteRow).min(1).max(500),
  planId: recordId,
  billingCycle,
  trialDays: z.int().min(1).max(365),
  gstStateCode,
});
export type CreateVipInvitesInput = z.infer<typeof createVipInvitesInput>;

export const vipInviteStatus = z.enum(["sent", "opened", "joined", "cancelled"]);

export const vipInvite = z.object({
  id: recordId,
  companyName: z.string(),
  ownerName: z.string(),
  ownerPhone: z.string().nullable(),
  ownerEmail: z.string().nullable(),
  city: z.string().nullable(),
  /** The link to send: the web app's /vip/<token>. */
  url: z.string(),
  status: vipInviteStatus,
  planName: z.string(),
  trialDays: z.int(),
  createdAt: z.iso.datetime(),
  firstOpenedAt: z.iso.datetime().nullable(),
  lastOpenedAt: z.iso.datetime().nullable(),
  openCount: z.int(),
  joinedAt: z.iso.datetime().nullable(),
  organizationId: recordId.nullable(),
});
export type VipInvite = z.infer<typeof vipInvite>;

export const vipInviteList = z.object({
  items: z.array(vipInvite),
  totals: z.object({ sent: z.int(), opened: z.int(), joined: z.int(), opens: z.int() }),
});
export type VipInviteList = z.infer<typeof vipInviteList>;

export const vipInviteIdInput = z.strictObject({ inviteId: recordId });

export { vipInviteOpened, type VipInviteOpened } from "../usage/index.js";

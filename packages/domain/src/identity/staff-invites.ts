// The invite email (spec 7.1: "the owner then gets an email invite"): the worker's listener for "staff.invited". It
// stores a link token the way Better Auth's password reset does, so the link opens the web app's reset page and the
// person chooses their password there; Better Auth then creates their password account and signs nothing else in.
import { createHash, randomBytes } from "node:crypto";
import { staffInvitedEvent } from "@travel-crm/contracts/identity";
import type { IdentityDatabase } from "@travel-crm/db/identity";
import { renderEmail, senderNameFor, type EmailSender } from "@travel-crm/integrations/email";
import { defineListener, type EventListener } from "../jobs/index.js";
import { isPlaceholderEmail } from "./sign-in-names.js";

/** How long an invite link works. Longer than a password reset's hour: an owner may open it the next day. */
export const INVITE_LINK_HOURS = 72;

export interface InviteDependencies {
  email: EmailSender;
  /** The web app's address; the link goes to its /reset-password page, as Better Auth's reset links do. */
  appUrl: string;
  /** The time now; tests pass a fixed one. */
  now?: () => Date;
}

export const SEND_INVITE_LISTENER = "identity.send-invite";

/**
 * The identifier Better Auth finds a reset token by. It keeps reset tokens only as a hash (ADR 0006: base64url
 * SHA-256 of "reset-password:<token>"), so the table holds no working link; the invite tests prove the two agree.
 */
function storedResetIdentifier(token: string): string {
  return createHash("sha256").update(`reset-password:${token}`).digest("base64url");
}

/**
 * Sends the invite. Nothing is sent to someone removed, banned, or without a real address. At least once, as every
 * listener: a retry after a failed send stores a second token and sends the email again; both links work until they
 * lapse.
 */
export function staffInviteListener(database: IdentityDatabase, dependencies: InviteDependencies): EventListener {
  const now = dependencies.now ?? (() => new Date());
  return defineListener({
    name: SEND_INVITE_LISTENER,
    eventType: "staff.invited",
    payload: staffInvitedEvent,
    handle: async (event) => {
      const { organizationId } = event;
      const invite = await database.forOrg(organizationId, async (tx) => {
        // Soft delete hides removed members; the member table has no row-level security, hence the organization.
        const member = await tx.member.findFirst({
          where: { id: event.payload.memberId, userId: event.payload.userId, organizationId },
          select: {
            user: { select: { id: true, name: true, email: true, banned: true } },
            organization: { select: { name: true } },
          },
        });
        if (!member || member.user.banned === true || isPlaceholderEmail(member.user.email)) return null;
        const token = randomBytes(24).toString("base64url");
        // Better Auth's own reset token: /reset-password consumes it, and its value is the user.
        await tx.verification.create({
          data: {
            identifier: storedResetIdentifier(token),
            value: member.user.id,
            expiresAt: new Date(now().getTime() + INVITE_LINK_HOURS * 60 * 60 * 1000),
          },
        });
        return { name: member.user.name, address: member.user.email, organization: member.organization.name, token };
      });
      if (!invite) return;
      const url = new URL("/reset-password", dependencies.appUrl);
      url.searchParams.set("token", invite.token);
      const content = renderEmail({
        heading: `Your account for ${invite.organization}`,
        paragraphs: [
          `${invite.organization} has an account for you. Choose your password, then sign in with ${invite.address}.`,
          `The link works for ${String(INVITE_LINK_HOURS / 24)} days. If it has run out, ask for a new one.`,
        ],
        action: { label: "Choose your password", url: url.toString() },
        footer: "You get this email because an account was set up for you. If you didn't expect it, ignore it.",
      });
      await dependencies.email.send({
        to: { name: invite.name, address: invite.address },
        fromName: senderNameFor(invite.organization),
        subject: `Your account for ${invite.organization}`,
        ...content,
      });
    },
  });
}

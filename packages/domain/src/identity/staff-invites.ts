// The invite email (spec 7.1: "the owner then gets an email invite"): the worker's listener for "staff.invited". It
// stores a link token the way Better Auth's password reset does, so the link opens the web app's reset page and the
// person chooses their password there; Better Auth then creates their password account and signs nothing else in.
// It is the agency's email (spec 9.4): its name as the sender, and replies go to its contact address.
import { createHash, randomBytes } from "node:crypto";
import { staffInvitedEvent, type StaffInvitedEvent } from "@travel-crm/contracts/identity";
import type { IdentityDatabase, IdentityTx } from "@travel-crm/db/identity";
import { renderEmail, senderNameFor, type EmailSender } from "@travel-crm/integrations/email";
import { defineListener, type EventListener } from "../jobs/index.js";
import type { RateLimiter } from "../rate-limits/index.js";
import { isBannedNow } from "./bans.js";
import {
  hasChosenPassword,
  PASSWORD_EMAILS_PER_RECIPIENT,
  passwordEmailRecipientKey,
  resetPasswordPageOf,
} from "./password-emails.js";
import { isPlaceholderEmail } from "./sign-in-names.js";

/** How long an invite link works. Longer than a password reset's hour: an owner may open it the next day. */
export const INVITE_LINK_HOURS = 72;

export interface InviteDependencies {
  email: EmailSender;
  /** The web app's address; the link goes to its /reset-password page, as Better Auth's reset links do. */
  appUrl: string;
  /** Counts each address's password emails, these and plan 3's resets, against PASSWORD_EMAILS_PER_RECIPIENT. */
  limiter: Pick<RateLimiter, "hit">;
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
 * The invited member, while they may still get the email: a member (soft delete hides removed ones), not banned, with
 * a real address, and no password yet. The member table has no row-level security, hence the organization.
 */
async function invitee(tx: IdentityTx, organizationId: string, invited: StaffInvitedEvent, now: Date) {
  const member = await tx.member.findFirst({
    where: { id: invited.memberId, userId: invited.userId, organizationId },
    select: {
      user: { select: { id: true, name: true, email: true, banned: true, banExpires: true } },
      organization: { select: { name: true, contactEmail: true } },
    },
  });
  if (!member || isBannedNow(member.user, now) || isPlaceholderEmail(member.user.email)) return null;
  if (await hasChosenPassword(tx, member.user.id)) return null;
  return { ...member.user, organization: member.organization };
}

/**
 * Sends the invite. Nothing is sent to someone removed, banned, without a real address, or who has a password by
 * then, nor past the address's cap. At least once, as every listener: a retry after a failed send stores a second
 * token and sends the email again; both links work until they lapse.
 */
export function staffInviteListener(database: IdentityDatabase, dependencies: InviteDependencies): EventListener {
  const now = dependencies.now ?? (() => new Date());
  return defineListener({
    name: SEND_INVITE_LISTENER,
    eventType: "staff.invited",
    payload: staffInvitedEvent,
    handle: async (event) => {
      const { organizationId } = event;
      const at = now();
      const person = await database.forOrg(organizationId, (tx) => invitee(tx, organizationId, event.payload, at));
      if (!person) return;
      // Over the cap nothing is stored or sent, and nothing said, as with plan 3's resets.
      const recipient = passwordEmailRecipientKey(person.email);
      if (!(await dependencies.limiter.hit(recipient, PASSWORD_EMAILS_PER_RECIPIENT, at)).allowed) return;
      const token = await database.forOrg(organizationId, async (tx) => {
        // Checked again in the transaction that stores the link: a removal may have landed meanwhile.
        if (!(await invitee(tx, organizationId, event.payload, at))) return null;
        const created = randomBytes(24).toString("base64url");
        // Better Auth's own reset token: /reset-password consumes it, and its value is the user.
        await tx.verification.create({
          data: {
            identifier: storedResetIdentifier(created),
            value: person.id,
            expiresAt: new Date(at.getTime() + INVITE_LINK_HOURS * 60 * 60 * 1000),
          },
        });
        return created;
      });
      if (token === null) return;
      const url = new URL(resetPasswordPageOf(dependencies.appUrl));
      url.searchParams.set("token", token);
      const organization = person.organization.name;
      const content = renderEmail({
        heading: `Your account for ${organization}`,
        paragraphs: [
          `${organization} has an account for you. Choose your password, then sign in with ${person.email}.`,
          `The link works for ${String(INVITE_LINK_HOURS / 24)} days. If it has run out, ask for a new one.`,
        ],
        action: { label: "Choose your password", url: url.toString() },
        footer: "You get this email because an account was set up for you. If you didn't expect it, ignore it.",
      });
      await dependencies.email.send({
        to: { name: person.name, address: person.email },
        fromName: senderNameFor(organization),
        replyTo: person.organization.contactEmail ?? undefined,
        subject: `Your account for ${organization}`,
        ...content,
      });
    },
  });
}

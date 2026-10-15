// The password-reset email (spec 6.2), from our address under the product's name, with the link Better Auth made.
// It is the product's own account email, not one sent for an agency, so it has no agency name and no Reply-To.
import { brand } from "@travel-crm/brand";
import type { SendPasswordResetEmail } from "@travel-crm/domain/identity";
import type { RateLimiter } from "@travel-crm/domain/rate-limits";
import { renderEmail, type EmailSender } from "@travel-crm/integrations/email";

/**
 * Reset emails one address gets at most: three an hour, counted in Postgres like the public routes' limits, so every
 * api instance counts together. Better Auth's own limit is per client address; this one stops many addresses (or many
 * instances) from filling one person's inbox.
 */
const PER_RECIPIENT = { limit: 3, windowSeconds: 60 * 60 };

/** The web app's reset page under APP_URL, the one place a reset link may lead back to. */
export function resetPasswordPageOf(appUrl: string): string {
  return `${appUrl.replace(/\/+$/, "")}/reset-password`;
}

/** What a failure's log line keeps: its code or name. Messages can quote the email, and so the reset link's token. */
function failureLabel(error: unknown): string {
  const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
  if (typeof code === "string" && code !== "") return code;
  return error instanceof Error ? error.name : "unknown error";
}

export function passwordResetEmails(email: EmailSender, limiter: Pick<RateLimiter, "hit">): SendPasswordResetEmail {
  return async ({ to, url }) => {
    try {
      // Over the cap, nothing is sent and nothing said: the request was answered before this ran.
      const recipient = await limiter.hit(`password-reset-recipient:${to.address.toLowerCase()}`, PER_RECIPIENT);
      if (!recipient.allowed) return;
      const content = renderEmail({
        heading: "Choose a new password",
        paragraphs: [
          `Someone asked to reset the password of your ${brand.productName} account.`,
          "If it was you, choose a new password with the button below. The link works for one hour.",
        ],
        action: { label: "Choose a new password", url },
        footer: "If you didn't ask for this, ignore this email: your password stays as it is.",
      });
      await email.send({ to, fromName: brand.emailSenderName, subject: "Reset your password", ...content });
    } catch (error) {
      // Not awaited by the request (the timing would tell whether the address exists), so this is the only report.
      console.error(`Could not send a password-reset email: ${failureLabel(error)}`);
    }
  };
}

// Password reset by email link (spec 6.2). Staff without email have only a placeholder address, so they never get
// one: their admin sets a temporary password instead (spec 6.3).
import type { Logger } from "@travel-crm/integrations/logging";
import { isPlaceholderEmail } from "../sign-in-names.js";

/** One password-reset email: to whom, and the link that lets them choose a new password. */
export interface PasswordResetEmail {
  to: { name: string; address: string };
  url: string;
}

/** Sends a password-reset email. It logs its own failures, and is not awaited. */
export type SendPasswordResetEmail = (email: PasswordResetEmail) => Promise<void>;

export interface PasswordResetSettings {
  sendEmail: SendPasswordResetEmail;
  /**
   * The web app's reset page, e.g. https://app.example.in/reset-password: the one place a reset link may lead back
   * to. A request naming any other `redirectTo` is refused, as an untrusted one is.
   */
  pageUrl: string;
}

/** A reset link's lifetime, in seconds. */
export const RESET_LINK_SECONDS = 60 * 60;

/** Better Auth's sendResetPassword, around ours. A failure the sender didn't report goes to `logger` (else the console). */
export function passwordResetSender(send: SendPasswordResetEmail, logger?: Logger) {
  return ({ user, url }: { user: { name: string; email: string }; url: string }): Promise<void> => {
    if (!isPlaceholderEmail(user.email)) {
      // Off the request path entirely, as Better Auth advises: the answer goes out first, so how long sending takes
      // (or a sender that throws at once) can't tell a caller whether the address exists.
      setImmediate(() => {
        Promise.resolve()
          .then(() => send({ to: { name: user.name, address: user.email }, url }))
          .catch(() => {
            // The sender logs its own failures. The error itself may quote the link, so it is never printed here.
            if (logger) logger.error({}, "A password-reset email could not be sent");
            else console.error("A password-reset email could not be sent");
          });
      });
    }
    return Promise.resolve();
  };
}

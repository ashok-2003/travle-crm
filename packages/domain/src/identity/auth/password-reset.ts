// Password reset by email link (spec 6.2). Staff without email have only a placeholder address, so they never get
// one: their admin sets a temporary password instead (spec 6.3).
import { isPlaceholderEmail } from "../sign-in-names.js";

/** One password-reset email: to whom, and the link that lets them choose a new password. */
export interface PasswordResetEmail {
  to: { name: string; address: string };
  url: string;
}

/** Sends a password-reset email. It logs its own failures, and is not awaited. */
export type SendPasswordResetEmail = (email: PasswordResetEmail) => Promise<void>;

/** Better Auth's sendResetPassword, around ours. */
export function passwordResetSender(send: SendPasswordResetEmail) {
  return ({ user, url }: { user: { name: string; email: string }; url: string }): Promise<void> => {
    if (!isPlaceholderEmail(user.email)) {
      // Not awaited, as Better Auth advises: how long sending takes would tell a caller whether the address exists.
      // The sender logs its own failures; a failure must never crash the api.
      void send({ to: { name: user.name, address: user.email }, url }).catch(() => undefined);
    }
    return Promise.resolve();
  };
}

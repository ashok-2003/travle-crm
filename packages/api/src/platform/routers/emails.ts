// The console's failed emails (the owner, 2026-11-02; the failed-emails spec): the emails that failed in the last 30
// days, each as it was sent, and sending one again. Super admins only, never support: the rows hold working reset and
// invite links.
import {
  emailIdInput,
  failedEmailsPage,
  listFailedEmailsInput,
  resendEmailOutput,
  storedEmail,
} from "@travel-crm/contracts/platform";
import { getStoredEmail, listFailedEmails, resendFailedEmail } from "@travel-crm/domain/platform";
import { superAdminProcedure } from "../procedures.js";
import { platformT } from "../trpc.js";

export const emailsRouter = platformT.router({
  /** The failed emails of the last 30 days, newest first, a page at a time. */
  failed: superAdminProcedure
    .input(listFailedEmailsInput)
    .output(failedEmailsPage)
    .query(({ ctx, input }) => listFailedEmails(ctx.services, input)),
  /** One email exactly as it was sent, links included, with how it went and its resends. */
  get: superAdminProcedure
    .input(emailIdInput)
    .output(storedEmail)
    .query(({ ctx, input }) => getStoredEmail(ctx.services, input.id)),
  /** Sends a failed email again, as it was; the platform log records it. Answers the new email's status. */
  resend: superAdminProcedure
    .input(emailIdInput)
    .output(resendEmailOutput)
    .mutation(({ ctx, input }) => resendFailedEmail(ctx.services, ctx.staff, input)),
});

// whatsapp.*: the console's WhatsApp numbers (spec 3.5, ADR 0035). Platform staff of either level may look; only a super admin
// records, marks connected, pauses, resumes, disconnects, sets the caps, asks MSG91 and reads the webhook block with the secrets.
import {
  connectWhatsappInput,
  consoleConnectionList,
  consoleOrganizationWhatsapp,
  setWhatsappCapsInput,
  whatsappOrganizationInput,
  whatsappWebhookSettings as webhookSettingsOutput,
} from "@travel-crm/contracts/inbox";
import {
  checkWhatsAppWithProvider,
  connectWhatsApp,
  disconnectWhatsApp,
  getOrganizationWhatsApp,
  listWhatsAppConnections,
  markWhatsAppConnected,
  pauseWhatsApp,
  resumeWhatsApp,
  setWhatsAppCaps,
  whatsappWebhookSettings,
} from "@travel-crm/domain/platform";
import { z } from "zod";
import { staffProcedure, superAdminProcedure } from "../procedures.js";
import { platformT } from "../trpc.js";

export const whatsappRouter = platformT.router({
  list: staffProcedure
    .output(consoleConnectionList)
    .query(({ ctx }) => listWhatsAppConnections(ctx.services, new Date())),
  get: staffProcedure
    .input(whatsappOrganizationInput)
    .output(consoleOrganizationWhatsapp)
    .query(({ ctx, input }) => getOrganizationWhatsApp(ctx.services, input.organizationId, new Date())),
  connect: superAdminProcedure
    .input(connectWhatsappInput)
    .mutation(({ ctx, input }) => connectWhatsApp(ctx.services, ctx.staff, input)),
  markConnected: superAdminProcedure
    .input(whatsappOrganizationInput)
    .mutation(({ ctx, input }) => markWhatsAppConnected(ctx.services, ctx.staff, input.organizationId)),
  pause: superAdminProcedure
    .input(whatsappOrganizationInput)
    .mutation(({ ctx, input }) => pauseWhatsApp(ctx.services, ctx.staff, input.organizationId)),
  resume: superAdminProcedure
    .input(whatsappOrganizationInput)
    .mutation(({ ctx, input }) => resumeWhatsApp(ctx.services, ctx.staff, input.organizationId)),
  disconnect: superAdminProcedure
    .input(whatsappOrganizationInput)
    .mutation(({ ctx, input }) => disconnectWhatsApp(ctx.services, ctx.staff, input.organizationId)),
  setCaps: superAdminProcedure
    .input(setWhatsappCapsInput)
    .mutation(({ ctx, input }) => setWhatsAppCaps(ctx.services, ctx.staff, input)),
  checkWithProvider: superAdminProcedure
    .input(whatsappOrganizationInput)
    .output(z.object({ answered: z.boolean() }))
    .mutation(({ ctx, input }) => checkWhatsAppWithProvider(ctx.services, input.organizationId)),
  /** The URL and header to paste in MSG91's panel: the only place the secrets are shown, to super admins. */
  webhookSettings: superAdminProcedure
    .output(webhookSettingsOutput.nullable())
    .query(({ ctx }) => whatsappWebhookSettings(ctx.services)),
});

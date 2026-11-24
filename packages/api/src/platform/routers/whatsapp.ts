// whatsapp.*: the console's WhatsApp numbers (spec 3.5, ADR 0035; several numbers, spec 2026-11-22 section 10). Platform
// staff of either level may look; only a super admin records, marks connected, pauses, resumes, disconnects, renames, makes
// main, sets the caps, asks MSG91 and reads the webhook block with the secrets. Each action names one number.
import {
  connectWhatsappInput,
  consoleConnectionList,
  consoleOrganizationWhatsapp,
  renameWhatsappInput,
  setWhatsappCapsInput,
  whatsappNumberInput,
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
  renameWhatsApp,
  resumeWhatsApp,
  setWhatsAppCaps,
  setWhatsAppMain,
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
    .input(whatsappNumberInput)
    .mutation(({ ctx, input }) => markWhatsAppConnected(ctx.services, ctx.staff, input)),
  pause: superAdminProcedure
    .input(whatsappNumberInput)
    .mutation(({ ctx, input }) => pauseWhatsApp(ctx.services, ctx.staff, input)),
  resume: superAdminProcedure
    .input(whatsappNumberInput)
    .mutation(({ ctx, input }) => resumeWhatsApp(ctx.services, ctx.staff, input)),
  disconnect: superAdminProcedure
    .input(whatsappNumberInput)
    .mutation(({ ctx, input }) => disconnectWhatsApp(ctx.services, ctx.staff, input)),
  setMain: superAdminProcedure
    .input(whatsappNumberInput)
    .mutation(({ ctx, input }) => setWhatsAppMain(ctx.services, ctx.staff, input)),
  rename: superAdminProcedure
    .input(renameWhatsappInput)
    .mutation(({ ctx, input }) => renameWhatsApp(ctx.services, ctx.staff, input)),
  setCaps: superAdminProcedure
    .input(setWhatsappCapsInput)
    .mutation(({ ctx, input }) => setWhatsAppCaps(ctx.services, ctx.staff, input)),
  checkWithProvider: superAdminProcedure
    .input(whatsappNumberInput)
    .output(z.object({ answered: z.boolean() }))
    .mutation(({ ctx, input }) => checkWhatsAppWithProvider(ctx.services, input)),
  /** The URL and header to paste in MSG91's panel: the only place the secrets are shown, to super admins. */
  webhookSettings: superAdminProcedure
    .output(webhookSettingsOutput.nullable())
    .query(({ ctx }) => whatsappWebhookSettings(ctx.services)),
});

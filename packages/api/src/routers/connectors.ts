// connectors.*: the Integrations and Developer panels (release D): website forms and lead links, API keys, outgoing
// webhooks and their deliveries, and connections to Meta lead ads and IndiaMART. All need settings:manage; making a
// key, a link or a connection reads the session from the database (freshProcedure), as they hand out secrets.
import {
  apiKey,
  captureIdInput,
  connectIndiaMartInput,
  connection,
  connectionIdInput,
  connectMetaInput,
  createApiKeyInput,
  createdApiKey,
  createdLeadCapture,
  createLeadCaptureInput,
  createWebhookInput,
  leadCapture,
  updateFormInput,
  webhookDelivery,
  webhookSubscription,
} from "@travel-crm/contracts/connectors";
import {
  connectIndiaMart,
  connectMetaPage,
  createApiKey,
  createCapture,
  createWebhook,
  disconnect,
  listApiKeys,
  listCaptures,
  listConnections,
  listDeliveries,
  listWebhooks,
  revokeApiKey,
  setCaptureDisabled,
  setWebhookDisabled,
  updateForm,
  type ConnectorServices,
} from "@travel-crm/domain/connectors";
import { DomainError } from "@travel-crm/domain/kernel";
import { z } from "zod";
import { freshProcedure, orgProcedure } from "../procedures.js";
import { router } from "../trpc.js";

const viewer = orgProcedure.requires("settings:manage");
const changer = orgProcedure.requires("settings:manage");
const secretMaker = freshProcedure.requires("settings:manage");

const switchInput = z.strictObject({ id: z.uuid(), disabled: z.boolean() });

function servicesOf(connectors: ConnectorServices | null): ConnectorServices {
  if (connectors === null) {
    throw new DomainError("CONFLICT", "INTEGRATIONS_NOT_SET_UP", "Connections to other services aren't set up yet");
  }
  return connectors;
}

export const connectorsRouter = router({
  captures: router({
    list: viewer
      .output(z.array(leadCapture))
      .query(({ ctx }) => ctx.db.forOrg(ctx.member.organizationId, (tx) => listCaptures(tx))),
    create: secretMaker
      .input(createLeadCaptureInput)
      .output(createdLeadCapture)
      .mutation(({ ctx, input }) =>
        ctx.db.forOrg(ctx.member.organizationId, (tx) => createCapture(tx, ctx.member, input)),
      ),
    update: changer
      .input(updateFormInput)
      .output(leadCapture)
      .mutation(({ ctx, input }) =>
        ctx.db.forOrg(ctx.member.organizationId, (tx) => updateForm(tx, ctx.member, input)),
      ),
    setDisabled: changer
      .input(switchInput)
      .mutation(({ ctx, input }) =>
        ctx.db.forOrg(ctx.member.organizationId, (tx) => setCaptureDisabled(tx, ctx.member, input.id, input.disabled)),
      ),
  }),

  apiKeys: router({
    list: viewer
      .output(z.array(apiKey))
      .query(({ ctx }) => ctx.db.forOrg(ctx.member.organizationId, (tx) => listApiKeys(tx))),
    create: secretMaker
      .input(createApiKeyInput)
      .output(createdApiKey)
      .mutation(({ ctx, input }) =>
        ctx.db.forOrg(ctx.member.organizationId, (tx) => createApiKey(tx, ctx.member, input)),
      ),
    revoke: changer
      .meta({ lifecycle: "revoke" })
      .input(captureIdInput)
      .mutation(({ ctx, input }) =>
        ctx.db.forOrg(ctx.member.organizationId, (tx) => revokeApiKey(tx, ctx.member, input.id)),
      ),
  }),

  webhooks: router({
    list: viewer
      .output(z.array(webhookSubscription))
      .query(({ ctx }) => ctx.db.forOrg(ctx.member.organizationId, (tx) => listWebhooks(tx))),
    create: secretMaker
      .input(createWebhookInput)
      .output(webhookSubscription)
      .mutation(({ ctx, input }) =>
        ctx.db.forOrg(ctx.member.organizationId, (tx) => createWebhook(tx, ctx.member, input)),
      ),
    setDisabled: changer
      .input(switchInput)
      .mutation(({ ctx, input }) =>
        ctx.db.forOrg(ctx.member.organizationId, (tx) => setWebhookDisabled(tx, ctx.member, input.id, input.disabled)),
      ),
    deliveries: viewer
      .input(captureIdInput)
      .output(z.array(webhookDelivery))
      .query(({ ctx, input }) => ctx.db.forOrg(ctx.member.organizationId, (tx) => listDeliveries(tx, input.id))),
  }),

  connections: router({
    list: viewer
      .output(z.array(connection))
      .query(({ ctx }) => ctx.db.forOrg(ctx.member.organizationId, (tx) => listConnections(tx))),
    /** Whether connecting other services is set up on this server (INTEGRATION_SECRETS_KEY). */
    available: viewer
      .output(z.object({ available: z.boolean() }))
      .query(({ ctx }) => ({ available: ctx.connectors !== null && ctx.connectors.box !== null })),
    connectMeta: secretMaker
      .input(connectMetaInput)
      .output(connection)
      .mutation(({ ctx, input }) => {
        const services = servicesOf(ctx.connectors);
        return connectMetaPage({ db: ctx.db, meta: services.meta, box: services.box }, ctx.member, input);
      }),
    connectIndiaMart: secretMaker
      .input(connectIndiaMartInput)
      .output(connection)
      .mutation(({ ctx, input }) => {
        const services = servicesOf(ctx.connectors);
        return connectIndiaMart({ db: ctx.db, box: services.box }, ctx.member, input);
      }),
    disconnect: changer
      .meta({ lifecycle: "revoke" })
      .input(connectionIdInput)
      .mutation(({ ctx, input }) =>
        ctx.db.forOrg(ctx.member.organizationId, (tx) => disconnect(tx, ctx.member, input.id)),
      ),
  }),
});

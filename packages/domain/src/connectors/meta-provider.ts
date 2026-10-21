// Meta's leadgen webhook as a provider of the generic intake (release D): a page's new lead ad answer. Meta signs each
// delivery with the app's secret (x-hub-signature-256); a delivery names the page and the lead's id, never the lead,
// which the worker fetches from Meta with the page's own token and brings in once (connections.ts).
import type { Database } from "@travel-crm/db";
import type { WebhookProvider } from "../webhooks/index.js";
import { hmacSha256Signature } from "../webhooks/index.js";
import { connectionOrganization, receiveMetaLead, type MetaDependencies } from "./connections.js";
import type { IntakeDependencies } from "./intake.js";

interface LeadgenChange {
  field?: string;
  value?: { leadgen_id?: string; page_id?: string };
}

interface PageDelivery {
  object?: string;
  entry?: { id?: string; changes?: LeadgenChange[] }[];
}

/** Each lead the delivery tells of: its page and its id. */
export function leadgenNotices(rawBody: string): { pageId: string; leadgenId: string }[] {
  let body: PageDelivery;
  try {
    body = JSON.parse(rawBody) as PageDelivery;
  } catch {
    return [];
  }
  if (body.object !== "page") return [];
  return (body.entry ?? []).flatMap((entry) =>
    (entry.changes ?? []).flatMap((change) => {
      const pageId = change.value?.page_id ?? entry.id;
      const leadgenId = change.value?.leadgen_id;
      return change.field === "leadgen" && pageId && leadgenId ? [{ pageId, leadgenId }] : [];
    }),
  );
}

export function metaLeadsProvider(
  dependencies: MetaDependencies & IntakeDependencies & { withoutOrg: Database["withoutOrg"]; appSecret: string },
): WebhookProvider {
  return {
    name: "meta",
    keptHeaders: ["x-hub-signature-256"],
    verify: hmacSha256Signature({
      secret: dependencies.appSecret,
      header: "x-hub-signature-256",
      prefix: "sha256=",
      encoding: "hex",
    }),
    identify: ({ rawBody }) => {
      const [first] = leadgenNotices(rawBody);
      return first === undefined ? null : { eventId: first.leadgenId, eventType: "leadgen" };
    },
    process: async (event, processing) => {
      for (const notice of leadgenNotices(event.payload)) {
        const organizationId = await connectionOrganization(dependencies.withoutOrg, "meta_lead_ads", notice.pageId);
        if (organizationId === null) continue;
        processing.isAbout(organizationId);
        await receiveMetaLead(dependencies, notice);
      }
    },
  };
}

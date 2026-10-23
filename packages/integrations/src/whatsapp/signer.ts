// Builds the webhook calls MSG91 would make, for tests and the journeys (ADR 0035): the path with its token, the static
// header, and the JSON bodies of an inbound message, an echo and a status. MSG91 signs nothing, so there is no signature.
import { WHATSAPP_WEBHOOK_HEADER } from "./whatsapp-provider.js";

export interface Msg91SignerOptions {
  token: string;
  key: string;
}

export interface InboundBodyInput {
  /** Our number, digits. */
  integratedNumber: string;
  /** The customer's number, digits with the country code. */
  customerNumber: string;
  wamid: string;
  customerName?: string;
  text?: string;
  contentType?: string;
  caption?: string;
  filename?: string;
  url?: string;
  latitude?: number;
  longitude?: number;
  replyMsgId?: string;
  /** Unix seconds. */
  ts?: number;
  /** "1" makes it an echo from the phone app. */
  direction?: "0" | "1";
}

export interface StatusBodyInput {
  integratedNumber: string;
  customerNumber: string;
  wamid: string;
  eventName: "sent" | "delivered" | "read" | "failed";
  reason?: string;
  ts?: number;
}

/** MSG91's sample shape for a message. */
export function inboundBody(input: InboundBodyInput): Record<string, string | number> {
  const { integratedNumber, customerNumber, wamid, direction = "0", contentType = "text", ...rest } = input;
  const optional = Object.entries(rest);
  return {
    companyId: "company-1",
    customerNumber,
    integratedNumber,
    uuid: wamid,
    direction,
    contentType,
    ...Object.fromEntries(optional),
  };
}

/** MSG91's sample shape for a delivery report. */
export function statusBody(input: StatusBodyInput): Record<string, string | number> {
  return {
    companyId: "company-1",
    customerNumber: input.customerNumber,
    integratedNumber: input.integratedNumber,
    uuid: input.wamid,
    direction: "1",
    eventName: input.eventName,
    ...(input.reason === undefined ? {} : { reason: input.reason }),
    ...(input.ts === undefined ? {} : { ts: input.ts }),
  };
}

/** The path, headers and JSON of a call to the webhook, as MSG91's panel is set up to make it. */
export function msg91Signer(options: Msg91SignerOptions) {
  return {
    path: `/webhooks/msg91-whatsapp/${options.token}`,
    headers: { "content-type": "application/json", [WHATSAPP_WEBHOOK_HEADER]: options.key } as Record<string, string>,
    /** The body a call carries: the events as one object, or a list when there are several. */
    body: (events: readonly object[]): string => JSON.stringify(events.length === 1 ? events[0] : events),
    inbound: inboundBody,
    status: statusBody,
  };
}

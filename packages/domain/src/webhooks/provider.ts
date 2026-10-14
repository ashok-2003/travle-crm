// What a webhook provider (Razorpay, Meta's WhatsApp, ...) plugs into the generic intake (spec 9.7). The Foundation
// ships the intake and no provider; each arrives with its module.

/** A delivery as it reached the api: its headers and the body exactly as sent. */
export interface WebhookRequest {
  headers: Headers;
  rawBody: string;
}

/** A delivery as stored, for the provider's handler in the worker. */
export interface StoredWebhookEvent {
  id: string;
  provider: string;
  providerEventId: string;
  eventType: string;
  receivedAt: Date;
  /** Only the headers the provider named in keptHeaders. */
  headers: Readonly<Record<string, string>>;
  payload: string;
  attempts: number;
}

export interface WebhookProvider {
  /** The path segment in /webhooks/<name>: lower-case letters, digits and hyphens. */
  readonly name: string;
  /** The headers worth keeping with the event, lower case. Cookies and authorization are never kept. */
  readonly keptHeaders: readonly string[];
  /** True when the request really comes from the provider. Never throws for a bad signature: returns false. */
  verify(request: WebhookRequest): boolean;
  /** The provider's id and type for the event, or null when the body doesn't say. */
  identify(request: WebhookRequest): { eventId: string; eventType: string } | null;
  /**
   * Handles one stored event, in the worker: finds the organization from the payload and does the work in
   * db.forOrg(). Runs at least once per event; repeats of the same delivery never reach it twice.
   */
  process(event: StoredWebhookEvent): Promise<void>;
}

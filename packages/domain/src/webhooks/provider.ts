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

/** What a provider's handler tells the intake about the event it processes. */
export interface WebhookProcessing {
  /**
   * The organization the event is about, once the handler has found it: the event is kept with it, even if the
   * handler then fails, so that organization's purge, or an erasure in it, can blank the stored payload (ADR 0023).
   * Throws a RangeError for anything but an organization's id (a UUID), which fails the handler's attempt.
   */
  isAbout(organizationId: string): void;
}

export interface WebhookProvider {
  /** The path segment in /webhooks/<name>: lower-case letters, digits and hyphens. */
  readonly name: string;
  /** The headers worth keeping with the event, lower case. Cookies and authorization are never kept. */
  readonly keptHeaders: readonly string[];
  /**
   * True when the request really comes from the provider. Returns false for a bad signature and should never throw
   * (if it does, the intake answers 400). May be asynchronous, e.g. to look up a secret per organization.
   */
  verify(request: WebhookRequest): boolean | Promise<boolean>;
  /**
   * The provider's id and type for the event, or null when the body doesn't say. Should never throw (if it does,
   * the intake answers 400). A signed body this can't read is answered 400 and not stored.
   */
  identify(request: WebhookRequest): { eventId: string; eventType: string } | null;
  /**
   * Handles one stored event, in the worker: finds the organization from the payload and does the work in
   * db.forOrg(). Runs at least once per event, not exactly once: the mark-processed update is a separate
   * transaction, so a crash or a retry can run it again. Do the work idempotently inside db.forOrg(), keyed by
   * `event.id` or `event.providerEventId` (for example a unique key on the payment record). Tell `processing` which
   * organization the event was about.
   */
  process(event: StoredWebhookEvent, processing: WebhookProcessing): Promise<void>;
}

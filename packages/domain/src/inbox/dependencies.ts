// What the inbox module's steps are built from: the database, the WhatsApp provider (null when the MSG91 settings are not set:
// WhatsApp is off), the files module and the job queue for copying media, the agency facts the lead path needs, and the log.
import type { Database } from "@travel-crm/db";
import type { JobQueue } from "@travel-crm/integrations/jobs";
import type { Logger } from "@travel-crm/integrations/logging";
import type { WhatsAppProvider } from "@travel-crm/integrations/whatsapp";
import type { AgencyDependencies } from "../crm/index.js";
import type { Files } from "../files/index.js";
import type { RateLimiter } from "../rate-limits/index.js";

export interface InboxDependencies extends AgencyDependencies {
  db: Database;
  provider: WhatsAppProvider | null;
  files: Files;
  /** Where a stored media message queues its copy job; the health job re-queues what was never queued. */
  queue: JobQueue;
  logger: Logger;
  /** The per-minute send budget (spec 4.4 S5). */
  limiter: Pick<RateLimiter, "hit">;
  /** Everyone who can assign leads: told when WhatsApp needs the agency's attention (spec 4.8). */
  managers: (organizationId: string) => Promise<string[]>;
}

/** The queue that copies one inbound file into our storage. Its data is `{ organizationId, messageId }`. */
export const COPY_MEDIA_QUEUE = "whatsapp.copy-media";
/** The webhook provider's name: /webhooks/msg91-whatsapp/<token>. */
export const WHATSAPP_PROVIDER = "msg91-whatsapp";
/** The five-minute health check. */
export const WHATSAPP_HEALTH_QUEUE = "whatsapp.health";
/** The hourly job that makes leads for chats stored while the subscription did not allow it. */
export const ADOPT_QUEUE = "whatsapp.adopt";
/** The half-hourly read of every agency's templates and their statuses. */
export const WHATSAPP_TEMPLATES_QUEUE = "whatsapp.sync-templates";

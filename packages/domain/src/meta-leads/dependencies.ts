// What the meta-leads module's steps are built from: the database, the Graph port and the token box (null when the Meta
// settings are not set: Meta is off), the limiter that keeps the per-organization Graph budget and the login's nonces, the
// login's settings, and the log.
import type { Database } from "@travel-crm/db";
import type { Logger } from "@travel-crm/integrations/logging";
import type { MetaGraph } from "@travel-crm/integrations/meta-graph";
import type { SecretBox } from "@travel-crm/integrations/secret-box";
import type { RateLimiter } from "../rate-limits/index.js";

export interface MetaLoginSettings {
  appId: string;
  /** Signs the login's state (the same secret the webhook is signed with, never sent to the browser). */
  appSecret: string;
  /** Facebook Login for Business: the saved configuration passed as config_id. */
  loginConfigId: string;
  /** Where Facebook sends the browser back to: the web app's callback page. */
  redirectUri: string;
}

export interface MetaDependencies {
  db: Database;
  graph: MetaGraph | null;
  secretBox: SecretBox | null;
  limiter: RateLimiter;
  login: MetaLoginSettings | null;
  logger: Logger;
}

/** The Graph port and the box, or the refusal that Meta is not set up. */
export function metaServices(dependencies: MetaDependencies): { graph: MetaGraph; secretBox: SecretBox } | null {
  const { graph, secretBox } = dependencies;
  return graph === null || secretBox === null ? null : { graph, secretBox };
}

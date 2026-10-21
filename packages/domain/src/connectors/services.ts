// What the connectors need from the outside world, built once per process from its settings: the box that seals
// credentials (null until INTEGRATION_SECRETS_KEY is set), Meta's Graph, IndiaMART, and posting to webhooks.
import type { HttpOut } from "@travel-crm/integrations/http-out";
import type { IndiaMart } from "@travel-crm/integrations/indiamart";
import type { MetaGraph } from "@travel-crm/integrations/meta";
import type { SecretBox } from "./secret-box.js";

export interface ConnectorServices {
  box: SecretBox | null;
  meta: MetaGraph;
  indiaMart: IndiaMart;
  http: HttpOut;
}

// One record's history, the audit log's one filter, kept in the address (?entityType=role&entityId=…) so a link can
// open it. Read with the api's own rules: an address the api would refuse shows the whole log instead.
import { auditEntityType } from "@travel-crm/contracts/audit";
import { recordId } from "@travel-crm/contracts/identity";
import { routes } from "@/lib/routes";

/** The record whose history to show: its kind ("role") and id. */
export interface RecordFilter {
  entityType: string;
  entityId: string;
}

/** The record the address names, or null for the whole log. */
export function recordFilterOf(search: Pick<URLSearchParams, "get">): RecordFilter | null {
  const entityType = auditEntityType.safeParse(search.get("entityType"));
  const entityId = recordId.safeParse(search.get("entityId"));
  return entityType.success && entityId.success ? { entityType: entityType.data, entityId: entityId.data } : null;
}

/** The address of one record's history. */
export function recordHistoryHref({ entityType, entityId }: RecordFilter): string {
  return `${routes.audit}?${new URLSearchParams({ entityType, entityId }).toString()}`;
}

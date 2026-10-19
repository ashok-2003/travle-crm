// The connector's access, resolved afresh each time a check runs (S10, B31): still a member, still holding what the sheet
// needs, in an agency whose subscription still allows changes and has the module. importerAccess's twin for a connection.
import type { ImportFailureReason } from "@travel-crm/contracts/imports";
import { jobMemberAccess } from "../imports/index.js";
import type { MemberAccess, Permission } from "../identity/index.js";
import type { SheetConnectionRow } from "./connection-row.js";
import type { SheetsJobDependencies } from "./job-dependencies.js";

/** What a check needs of the connector: to create leads and to give them to others (a sheet decides owners, spec 2). */
export const connectorPermissions: readonly Permission[] = ["leads:create", "leads:assign"];

export function connectorAccess(
  dependencies: Pick<SheetsJobDependencies, "identity" | "subscriptions">,
  connection: Pick<SheetConnectionRow, "organizationId" | "connectedBy" | "impersonatedBy">,
  required: readonly Permission[] = connectorPermissions,
): Promise<{ access: MemberAccess } | { failure: ImportFailureReason }> {
  return jobMemberAccess(
    dependencies,
    {
      organizationId: connection.organizationId,
      userId: connection.connectedBy,
      impersonatedBy: connection.impersonatedBy,
    },
    required,
  );
}

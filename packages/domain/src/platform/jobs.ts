// The platform's own jobs, which only the console process runs: it alone holds the platform role's connection.
import { ownMessage, type JobData } from "@travel-crm/integrations/jobs";
import type { JobHandler } from "../jobs/index.js";
import { ERASE_SUBJECT_QUEUE, eraseSubject, erasureJobOf } from "./erasure.js";
import { organizationExportJobHandlers } from "./organization-export-job.js";
import { PURGE_ORGANIZATION_QUEUE, purgeOrganization } from "./purge.js";
import type { PlatformServices } from "./services.js";

function purgeJobOf(data: JobData): { organizationId: string; requestedBy: string | null } {
  const { organizationId, requestedBy } = data;
  // Our own fixed words, so the failed-jobs list keeps them.
  if (typeof organizationId !== "string") throw ownMessage(new TypeError("A purge job needs an organizationId"));
  return { organizationId, requestedBy: typeof requestedBy === "string" ? requestedBy : null };
}

/** The handlers the console process registers with its job runner. */
export function platformJobHandlers(services: PlatformServices): JobHandler[] {
  return [
    {
      queue: PURGE_ORGANIZATION_QUEUE,
      handle: async (data) => {
        await purgeOrganization(services, purgeJobOf(data));
      },
    },
    {
      queue: ERASE_SUBJECT_QUEUE,
      handle: async (data) => {
        await eraseSubject(services, erasureJobOf(data));
      },
    },
    ...organizationExportJobHandlers(services),
  ];
}

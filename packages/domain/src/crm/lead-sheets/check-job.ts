// sheets.check (spec 7, S2, S19, S36): the job a due sheet is queued as. Its data is two ids; it runs the check in the
// sheet's organization, then sets when the sheet is next due and lets go of its claim, or removes the schedule row when
// the sheet no longer needs one. The queue runs four at a time.
import { isUuid } from "../../kernel/index.js";
import { ownMessage } from "@travel-crm/integrations/jobs";
import type { JobHandler } from "../../jobs/index.js";
import {
  type CheckDependencies,
  checkConcurrency,
  spreadCheckSeconds,
  finishScheduledCheck,
  SHEETS_CHECK_QUEUE,
} from "../../sheets/index.js";
import { checkLeadSheet } from "./check-lead-sheet.js";

export function sheetsCheckHandler(dependencies: CheckDependencies): JobHandler {
  return {
    queue: SHEETS_CHECK_QUEUE,
    concurrency: checkConcurrency,
    handle: async (data) => {
      const { sheetId, organizationId } = data;
      // Ids only reach a database query; anything else is a malformed job, refused with a message written from no content.
      if (
        typeof sheetId !== "string" ||
        typeof organizationId !== "string" ||
        !isUuid(sheetId) ||
        !isUuid(organizationId)
      ) {
        throw ownMessage(new TypeError("A sheet check job needs a sheetId and an organizationId"));
      }
      const outcome = await checkLeadSheet(dependencies, { organizationId, sheetId, mode: "scheduled" });
      // The normal pace gets its random spread; a wait Google asked for (a hold) is kept as it is.
      const seconds =
        outcome.nextCheckInSeconds === dependencies.checkIntervalSeconds
          ? spreadCheckSeconds(dependencies.checkIntervalSeconds, dependencies.random)
          : outcome.nextCheckInSeconds;
      await finishScheduledCheck(dependencies.db, {
        sheetId,
        nextCheckAt: outcome.keepSchedule ? new Date(Date.now() + seconds * 1000) : null,
      });
    },
  };
}

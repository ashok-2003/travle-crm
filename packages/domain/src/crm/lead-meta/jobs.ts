// The Meta lead ads' jobs in crm (spec 4.5, 7): meta.catchup, the job a due Page is queued as; and the listeners that read a
// Page at once when someone asks (Check now, a Page resumed or reconnected) and that catch up the leads a form skipped
// when it is brought in.
import { metaCheckRequestedEvent, metaFormBroughtInEvent } from "@travel-crm/contracts/meta-leads";
import { ownMessage } from "@travel-crm/integrations/jobs";
import { defineListener, type EventListener, type JobHandler } from "../../jobs/index.js";
import { isUuid } from "../../kernel/index.js";
import { finishCatchup, META_CATCHUP_QUEUE, pageOf } from "../../meta-leads/index.js";
import { catchUpPage } from "./catch-up.js";
import type { MetaProcessDependencies } from "./process-change.js";

export function metaCatchupHandler(dependencies: MetaProcessDependencies): JobHandler {
  return {
    queue: META_CATCHUP_QUEUE,
    handle: async (data) => {
      const { metaPageId, organizationId } = data;
      // Ids only reach a database query; anything else is a malformed job, refused with a message written from no content.
      if (
        typeof metaPageId !== "string" ||
        !/^[A-Za-z0-9_-]{1,64}$/.test(metaPageId) ||
        typeof organizationId !== "string" ||
        !isUuid(organizationId)
      ) {
        throw ownMessage(new TypeError("A Meta catch-up job needs a metaPageId and an organizationId"));
      }
      const result = await catchUpPage(dependencies, organizationId, metaPageId, new Date());
      await finishCatchup(dependencies.db, {
        metaPageId,
        organizationId,
        nextCatchupAt: result.keepRoute ? new Date(Date.now() + result.nextInSeconds * 1000) : null,
      });
    },
  };
}

/** meta.check-now: on meta.check-requested the Page's forms are read at once; a Page that is not running reads nothing. */
export function checkMetaPageListener(dependencies: MetaProcessDependencies): EventListener {
  return defineListener({
    name: "meta.check-now",
    eventType: "meta.check-requested",
    payload: metaCheckRequestedEvent,
    handle: async (event, context) => {
      const page = await context.forOrg((tx) => pageOf(tx, event.payload.pageId));
      if (page?.status !== "running") return;
      await catchUpPage(dependencies, page.organizationId, page.pageId, new Date());
    },
  });
}

/** meta.form-brought-in: the leads the form skipped while it was not brought in are caught up (Q4). */
export function catchUpBroughtInFormListener(dependencies: MetaProcessDependencies): EventListener {
  return defineListener({
    name: "meta.catch-up-form",
    eventType: "meta.form-brought-in",
    payload: metaFormBroughtInEvent,
    handle: async (event, context) => {
      const page = await context.forOrg((tx) => pageOf(tx, event.payload.pageId));
      if (page?.status !== "running") return;
      await catchUpPage(dependencies, page.organizationId, page.pageId, new Date());
    },
  });
}

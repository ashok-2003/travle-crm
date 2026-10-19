// @vitest-environment node
// The screen's own lists of the platform's queues (it may not import the domain: web-reaches-the-api-over-http), named
// by the domain's constants: the jobs a failed one is asked for again rather than retried, and the schedules the
// console registers at every start. A queue renamed there fails here, before the screen offers what the api refuses.
import { ADVANCE_SUBSCRIPTIONS_QUEUE } from "@travel-crm/domain/subscriptions";
import {
  ERASE_SUBJECT_QUEUE,
  EXPORT_ORGANIZATION_QUEUE,
  PURGE_ORGANIZATION_QUEUE,
  RESET_DEMO_QUEUE,
  SWEEP_BULK_FILES_QUEUE,
  SWEEP_EXPIRED_EXPORTS_QUEUE,
  SWEEP_SHEETS_QUEUE,
  SWEEP_STORED_FILES_QUEUE,
} from "@travel-crm/domain/platform";
import { describe, expect, it } from "vitest";
import { ASKED_FOR_AGAIN_QUEUES, CONSOLE_SCHEDULES } from "@/console/jobs/platform-queues";

describe("the platform's queues", () => {
  it("are those the api never retries", () => {
    expect([...ASKED_FOR_AGAIN_QUEUES].sort()).toEqual(
      [PURGE_ORGANIZATION_QUEUE, ERASE_SUBJECT_QUEUE, EXPORT_ORGANIZATION_QUEUE].sort(),
    );
  });

  it("are the schedules the console registers at every start", () => {
    expect([...CONSOLE_SCHEDULES].sort()).toEqual(
      [
        ADVANCE_SUBSCRIPTIONS_QUEUE,
        SWEEP_STORED_FILES_QUEUE,
        SWEEP_EXPIRED_EXPORTS_QUEUE,
        SWEEP_BULK_FILES_QUEUE,
        SWEEP_SHEETS_QUEUE,
        RESET_DEMO_QUEUE,
      ].sort(),
    );
  });
});

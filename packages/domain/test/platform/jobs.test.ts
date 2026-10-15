// The platform's own jobs, as the console process registers them: one handler per queue, each reading its job's data
// back strictly, so a malformed job fails loudly, and says why, instead of acting on the wrong thing.
import { sanitizeJobError } from "@travel-crm/integrations/jobs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  DELETE_STORED_FILES_QUEUE,
  ERASE_SUBJECT_QUEUE,
  EXPIRE_EXPORTS_QUEUE,
  EXPORT_ORGANIZATION_QUEUE,
  platformJobHandlers,
  PURGE_ORGANIZATION_QUEUE,
} from "../../src/platform/index.js";
import { createTestPlatform, type TestPlatform } from "./test-platform.js";

describe("the platform's job handlers", () => {
  let test: TestPlatform;

  beforeAll(() => {
    test = createTestPlatform();
  });

  afterAll(async () => {
    await test.close();
  });

  it("cover the purge, the erasure, the stored files' deletions, the export and its expiry, once each", () => {
    const queues = platformJobHandlers(test.services).map((handler) => handler.queue);
    expect(queues).toEqual(
      expect.arrayContaining([
        PURGE_ORGANIZATION_QUEUE,
        ERASE_SUBJECT_QUEUE,
        DELETE_STORED_FILES_QUEUE,
        EXPORT_ORGANIZATION_QUEUE,
        EXPIRE_EXPORTS_QUEUE,
      ]),
    );
    expect(new Set(queues).size).toBe(queues.length);
  });

  it("refuse a purge, an erasure or an export job without its ids, in words of ours the failed-jobs list keeps", async () => {
    const handlerOf = (queue: string) => {
      const handler = platformJobHandlers(test.services).find((candidate) => candidate.queue === queue);
      if (!handler) throw new Error(`no handler for ${queue}`);
      return handler;
    };
    // What pg-boss stores of a failure is sanitizeJobError's copy: a library's error keeps only its name.
    const storedFailure = (promise: Promise<void>) =>
      promise.then(
        () => "no failure",
        (error: unknown) => sanitizeJobError(error).message,
      );
    expect(await storedFailure(handlerOf(PURGE_ORGANIZATION_QUEUE).handle({ requestedBy: null }))).toBe(
      "TypeError: A purge job needs an organizationId",
    );
    expect(await storedFailure(handlerOf(ERASE_SUBJECT_QUEUE).handle({ organizationId: "x", kind: "record" }))).toBe(
      "TypeError: An erasure job needs organizationId, requestedBy and requestId",
    );
    expect(await storedFailure(handlerOf(EXPORT_ORGANIZATION_QUEUE).handle({ exportId: 42 }))).toBe(
      "TypeError: An export job needs an exportId",
    );
    // An export that isn't there (any more) is nothing to do.
    await expect(
      handlerOf(EXPORT_ORGANIZATION_QUEUE).handle({ exportId: "0199e7a0-0000-7000-8000-00000000beef" }),
    ).resolves.toBeUndefined();
  });
});

// The platform's own jobs, as the console process registers them: one handler per queue, each reading its job's data
// back strictly, so a malformed job fails loudly instead of acting on the wrong thing.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
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

  it("cover the purge, the erasure, the export and its expiry, once each", () => {
    const queues = platformJobHandlers(test.services).map((handler) => handler.queue);
    expect(queues).toEqual(
      expect.arrayContaining([
        PURGE_ORGANIZATION_QUEUE,
        ERASE_SUBJECT_QUEUE,
        EXPORT_ORGANIZATION_QUEUE,
        EXPIRE_EXPORTS_QUEUE,
      ]),
    );
    expect(new Set(queues).size).toBe(queues.length);
  });

  it("refuse a purge or an export job without its id", async () => {
    const handlerOf = (queue: string) => {
      const handler = platformJobHandlers(test.services).find((candidate) => candidate.queue === queue);
      if (!handler) throw new Error(`no handler for ${queue}`);
      return handler;
    };
    await expect(handlerOf(PURGE_ORGANIZATION_QUEUE).handle({ requestedBy: null })).rejects.toThrow(TypeError);
    await expect(handlerOf(EXPORT_ORGANIZATION_QUEUE).handle({ exportId: 42 })).rejects.toThrow(TypeError);
    // An export that isn't there (any more) is nothing to do.
    await expect(
      handlerOf(EXPORT_ORGANIZATION_QUEUE).handle({ exportId: "0199e7a0-0000-7000-8000-00000000beef" }),
    ).resolves.toBeUndefined();
  });
});

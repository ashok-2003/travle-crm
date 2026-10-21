// A plain handler may ask for several jobs at once (the Sheets sync's checks run four at a time, S36); a listener's queue
// never does (X10), and a handler that names none works one at a time.
import { createDatabase, type Database } from "@travel-crm/db";
import { createMemoryJobQueue, createMemoryJobRunner } from "@travel-crm/integrations/jobs";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { startJobHandlers, startWorker } from "../../src/jobs/index.js";
import { recordingListener } from "./test-listeners.js";

describe("a handler's concurrency", () => {
  let db: Database;
  beforeAll(() => {
    db = createDatabase(inject("dbUrls").runtime, { maxConnections: 1 });
  });
  afterAll(async () => {
    await db.disconnect();
  });

  function watched() {
    const queue = createMemoryJobQueue();
    const memoryRunner = createMemoryJobRunner(queue);
    const worked: [string, unknown][] = [];
    const runner = {
      ...memoryRunner,
      work: (...args: Parameters<typeof memoryRunner.work>) => {
        worked.push([args[0], args[2]]);
        return memoryRunner.work(...args);
      },
    };
    return { queue, runner, worked };
  }
  const handle = () => Promise.resolve();

  it("passes a handler's concurrency to the runner, and none when it names none", async () => {
    const { queue, runner, worked } = watched();
    const worker = await startWorker({
      db,
      runner,
      queue,
      listeners: [recordingListener("imports.read-file", "import.uploaded")],
      handlers: [
        { queue: "sheets.check", concurrency: 4, handle },
        { queue: "webhooks.process", handle },
      ],
      relay: { organizationIds: [] },
    });
    await worker.stop();
    expect(worked).toEqual([
      ["imports.read-file", { concurrency: 1 }],
      ["sheets.check", { concurrency: 4 }],
      ["webhooks.process", undefined],
    ]);
  });

  it("does the same for the console's handlers", async () => {
    const { runner, worked } = watched();
    await startJobHandlers({ runner, handlers: [{ queue: "sheets.check", concurrency: 2, handle }] });
    expect(worked).toEqual([["sheets.check", { concurrency: 2 }]]);
  });
});

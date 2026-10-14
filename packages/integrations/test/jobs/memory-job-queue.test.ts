// The in-memory job queue records jobs, refuses badly named queues, and queues a repeated job id once.
import { describe, expect, it } from "vitest";
import { createMemoryJobQueue } from "../../src/jobs/index.js";

describe("memory job queue", () => {
  it("records each job with its queue, data and options", async () => {
    const queue = createMemoryJobQueue();
    const id = await queue.send("documents.render-pdf", { organizationId: "o1", documentId: "d1" }, { retryLimit: 3 });
    expect(queue.sent).toEqual([
      {
        id,
        queue: "documents.render-pdf",
        data: { organizationId: "o1", documentId: "d1" },
        options: { retryLimit: 3 },
      },
    ]);
  });

  it("queues a repeated job id once", async () => {
    const queue = createMemoryJobQueue();
    const id = "0199e7a0-0000-7000-8000-000000000001";
    expect(await queue.send("webhooks.process", { webhookEventId: "w1" }, { id })).toBe(id);
    expect(await queue.send("webhooks.process", { webhookEventId: "w1" }, { id })).toBeNull();
    expect(queue.sent).toHaveLength(1);
  });

  it("refuses queue names that are not <module>.<action>", async () => {
    const queue = createMemoryJobQueue();
    await expect(queue.send("RenderPdf", {})).rejects.toThrow(/Queue names/);
    await expect(queue.send("documents", {})).rejects.toThrow(/Queue names/);
  });
});

// The nightly sweep of what "Fill it for me" read: a recording or screenshot is deleted for good 30 days after upload (rows and
// stored bytes), a fresher one stays, and the fill that used it forgets it. Only ai_input files are touched.
import { randomUUID } from "node:crypto";
import { AI_INPUT_RECORD_TYPE } from "@travel-crm/contracts/files";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { sweepAiInputs } from "../../src/platform/index.js";
import { createTestPlatform, type TestPlatform } from "./test-platform.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-11-30T21:00:00Z");

describe("the nightly sweep of the AI's inputs", () => {
  let test: TestPlatform;
  let platform: PlatformClient;
  beforeAll(() => {
    test = createTestPlatform();
    platform = createPlatformClient(inject("dbUrls").platform);
  });
  afterAll(async () => {
    await test.close();
    await platform.$disconnect();
  });

  async function stored(organizationId: string, recordType: string, ageDays: number, status = "ready") {
    const recordId = randomUUID();
    const file = await platform.attachment.create({
      data: {
        organizationId,
        recordType,
        recordId,
        fileName: "recording.wav",
        contentType: "audio/wav",
        sizeBytes: 3,
        status,
        createdAt: new Date(NOW.getTime() - ageDays * DAY_MS),
        ...(status === "ready" ? { confirmedAt: new Date(NOW.getTime() - ageDays * DAY_MS) } : {}),
      },
    });
    const key = `organizations/${organizationId}/attachments/${file.id}`;
    if (status === "ready") await test.storage.put({ key, contentType: "audio/wav", body: new Uint8Array([1, 2, 3]) });
    return { id: file.id, key };
  }

  it("deletes the old recordings and screenshots with their bytes, keeps the new, and makes the fill forget", async () => {
    const organizationId = await createTestOrganization(platform, "Sweep agency");
    const old = await stored(organizationId, AI_INPUT_RECORD_TYPE, 31);
    const neverFinished = await stored(organizationId, AI_INPUT_RECORD_TYPE, 40, "pending");
    const fresh = await stored(organizationId, AI_INPUT_RECORD_TYPE, 5);
    const other = await stored(organizationId, "lead", 90);
    const fill = await platform.aiFill.create({
      data: {
        organizationId,
        target: "lead",
        requestedBy: randomUUID(),
        inputKind: "voice",
        inputAttachmentId: old.id,
        model: "m",
        proposalHash: "x",
      },
    });

    expect(await sweepAiInputs(test.services, NOW)).toBeGreaterThanOrEqual(2);

    const left = await platform.attachment.findMany({
      where: { id: { in: [old.id, neverFinished.id, fresh.id, other.id] } },
      select: { id: true },
    });
    expect(left.map((row) => row.id).sort()).toEqual([fresh.id, other.id].sort());
    expect(await test.storage.get(old.key)).toBeNull();
    expect(await test.storage.get(fresh.key)).not.toBeNull();
    expect(await test.storage.get(other.key)).not.toBeNull();
    expect((await platform.aiFill.findUniqueOrThrow({ where: { id: fill.id } })).inputAttachmentId).toBeNull();
  });

  it("does nothing when nothing is old", async () => {
    const organizationId = await createTestOrganization(platform, "Quiet agency");
    await stored(organizationId, AI_INPUT_RECORD_TYPE, 29);
    await sweepAiInputs(test.services, NOW);
    expect(await platform.attachment.count({ where: { organizationId, recordType: AI_INPUT_RECORD_TYPE } })).toBe(1);
  });
});

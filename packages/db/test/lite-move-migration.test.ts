// The move to the one lite agent (plan 5): the data migration clears only the earlier agents' planned follow-ups. The
// first agent's memory, voice copies, persona and lessons stay (the contract release is the owner's call), the lite agent's
// own follow-up stays, and running it again changes nothing. The test runs the migration's own SQL, twice.
import { readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createPlatformClient, type PlatformClient } from "../src/platform.js";
import { createTestOrganization } from "./helpers.js";

const migration = path.join(import.meta.dirname, "../prisma/migrations/20261214100000_lite_move/migration.sql");

describe("the move to the lite agent", () => {
  const urls = inject("dbUrls");
  let platform: PlatformClient;
  beforeAll(() => {
    platform = createPlatformClient(urls.platform);
  });
  afterAll(async () => {
    await platform.$disconnect();
  });

  async function runMigrationAsMigrator(): Promise<void> {
    const migrator = new pg.Client({ connectionString: urls.migrator });
    await migrator.connect();
    try {
      await migrator.query(await readFile(migration, "utf8"));
    } finally {
      await migrator.end();
    }
  }

  async function aChat(organizationId: string, connectionId: string, phone: string) {
    const chat = await platform.whatsappConversation.create({
      data: { organizationId, connectionId, phoneE164: phone },
      select: { id: true },
    });
    return chat.id;
  }

  it("clears the earlier agents' follow-ups and keeps everything else, the lite agent's follow-up too", async () => {
    const organizationId = await createTestOrganization(platform, "Moved agency");
    const number = `9191${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
    const connection = await platform.whatsappConnection.create({
      data: {
        organizationId,
        integratedNumber: number,
        displayNumber: `+${number}`,
        mode: "new_number",
        status: "connected",
      },
      select: { id: true },
    });
    const followUpAt = new Date("2026-12-20T05:00:00Z");
    const earlier = await aChat(organizationId, connection.id, "+919800000001");
    const lite = await aChat(organizationId, connection.id, "+919800000002");
    await platform.aiChat.create({
      data: {
        organizationId,
        conversationId: earlier,
        facts: { pickupCity: "Mumbai" },
        memory: "Wants Manali for 4.",
        voiceName: "Riya",
        voiceHistory: [{ own: true, text: "Hello" }],
        followUpAt,
        followUpReason: "Check in",
      },
    });
    await platform.aiChat.create({
      data: { organizationId, conversationId: lite, facts: { agent: "lite" }, followUpAt, followUpsSent: 1 },
    });
    await platform.aiAutopilot.create({
      data: { organizationId, persona: "natural", voiceName: "Riya", voiceProfile: "Warm and short" },
    });
    await platform.aiLearning.createMany({
      data: [
        { organizationId, kind: "need", text: "People ask for Manali" },
        { organizationId, kind: "faq", text: "Refunds take a week" },
      ],
    });

    await runMigrationAsMigrator();
    const read = async () => ({
      earlier: await platform.aiChat.findFirstOrThrow({ where: { conversationId: earlier } }),
      lite: await platform.aiChat.findFirstOrThrow({ where: { conversationId: lite } }),
    });
    const once = await read();
    expect(once.earlier).toMatchObject({
      followUpAt: null,
      followUpReason: null,
      memory: "Wants Manali for 4.",
      voiceName: "Riya",
      voiceHistory: [{ own: true, text: "Hello" }],
    });
    expect(once.lite).toMatchObject({ followUpAt, followUpsSent: 1 });
    expect(await platform.aiAutopilot.findFirstOrThrow({ where: { organizationId } })).toMatchObject({
      persona: "natural",
      voiceName: "Riya",
      voiceProfile: "Warm and short",
    });
    expect(await platform.aiLearning.count({ where: { organizationId } })).toBe(2);

    await runMigrationAsMigrator();
    expect(await read()).toEqual(once);
  });
});

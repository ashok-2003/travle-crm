// Several WhatsApp numbers per agency (migration 20261218900000_multi_number_whatsapp): an agency keeps any number of live
// numbers, one of them main and none recorded twice while live; a label is 1 to 20 characters; and a number an
// assignment rule names can't be deleted. Rows are written as the migrator, so the constraints alone are under test.
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createPlatformClient, type PlatformClient } from "../src/platform.js";
import { createTestOrganization } from "./helpers.js";

const digits = () => `91${String(Math.floor(Math.random() * 1e10)).padStart(10, "0")}`;

describe("an agency's WhatsApp numbers", () => {
  const urls = inject("dbUrls");
  let platform: PlatformClient;
  let client: pg.Client;
  beforeAll(async () => {
    platform = createPlatformClient(urls.platform);
    client = new pg.Client({ connectionString: urls.migrator });
    await client.connect();
  });
  afterAll(async () => {
    await client.end();
    await platform.$disconnect();
  });

  interface NumberRow {
    id: string;
    label: string;
    is_main: boolean;
    ai_answers: boolean;
  }

  const aNumber = async (
    organizationId: string,
    fields: { integratedNumber?: string; status?: string; isMain?: boolean; label?: string } = {},
  ): Promise<NumberRow> => {
    const result = await client.query<NumberRow>(
      `INSERT INTO whatsapp_connection (organization_id, id, integrated_number, display_number, mode, status, is_main, label)
       VALUES ($1, $2, $3, '+910000000000', 'new_number', $4, $5, COALESCE($6, 'WhatsApp'))
       RETURNING id, label, is_main, ai_answers`,
      [
        organizationId,
        randomUUID(),
        fields.integratedNumber ?? digits(),
        fields.status ?? "connected",
        fields.isMain ?? false,
        fields.label ?? null,
      ],
    );
    const [row] = result.rows;
    if (row === undefined) throw new Error("No number was recorded");
    return row;
  };

  it("keeps one main number and one live record of a number per agency", async () => {
    const organizationId = await createTestOrganization(platform);
    const integratedNumber = digits();
    await aNumber(organizationId, { integratedNumber, isMain: true });
    await expect(aNumber(organizationId, { isMain: true })).rejects.toMatchObject({
      constraint: "whatsapp_connection_main",
    });
    await expect(aNumber(organizationId, { integratedNumber })).rejects.toMatchObject({
      constraint: "whatsapp_connection_live_number",
    });
    // A disconnected number is history: it may have been main, and its number may be recorded again.
    await expect(
      aNumber(organizationId, { integratedNumber, isMain: true, status: "disconnected" }),
    ).resolves.toBeDefined();
  });

  it("lets an agency keep two live numbers", async () => {
    const organizationId = await createTestOrganization(platform);
    await aNumber(organizationId, { isMain: true });
    // Each starts labelled WhatsApp, not main, with its AI switch on.
    await expect(aNumber(organizationId)).resolves.toMatchObject({
      label: "WhatsApp",
      is_main: false,
      ai_answers: true,
    });
  });

  it("refuses a label of no characters or more than 20", async () => {
    const organizationId = await createTestOrganization(platform);
    for (const label of ["", "x".repeat(21)]) {
      await expect(aNumber(organizationId, { label })).rejects.toMatchObject({
        constraint: "whatsapp_connection_label_length",
      });
    }
    await expect(aNumber(organizationId, { label: "x".repeat(20) })).resolves.toMatchObject({ label: "x".repeat(20) });
  });

  it("refuses deleting a number an assignment rule names", async () => {
    const organizationId = await createTestOrganization(platform);
    const number = await aNumber(organizationId);
    await client.query(
      `INSERT INTO assignment_rule (organization_id, id, position, assignee_user_id, whatsapp_connection_id)
       VALUES ($1, $2, 0, $3, $4)`,
      [organizationId, randomUUID(), randomUUID(), number.id],
    );
    await expect(client.query("DELETE FROM whatsapp_connection WHERE id = $1", [number.id])).rejects.toMatchObject({
      constraint: "assignment_rule_whatsapp_connection_fkey",
    });
  });
});

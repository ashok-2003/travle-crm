// A traveller's pre-filled fields (bookings revamp): a list of the fields filled from the lead's person, empty for every row
// that exists and for any row made without it, and never null.
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

describe("booking_traveller.prefilled_fields", () => {
  const urls = inject("dbUrls");
  let client: pg.Client;
  beforeAll(async () => {
    client = new pg.Client({ connectionString: urls.migrator });
    await client.connect();
  });
  afterAll(async () => {
    await client.end();
  });

  it("is a text list that is not null and starts empty", async () => {
    const { rows } = await client.query<{
      data_type: string;
      udt_name: string;
      is_nullable: string;
      column_default: string;
    }>(
      `SELECT data_type, udt_name, is_nullable, column_default FROM information_schema.columns
       WHERE table_name = 'booking_traveller' AND column_name = 'prefilled_fields'`,
    );
    expect(rows[0]).toMatchObject({ data_type: "ARRAY", udt_name: "_text", is_nullable: "NO" });
    expect(rows[0]?.column_default).toContain("ARRAY[]");
  });
});

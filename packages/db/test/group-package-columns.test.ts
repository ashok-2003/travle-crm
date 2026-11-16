// A package's list columns (room types, weekly days, departure months) are never null: code reads them as lists.
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createPlatformClient, type PlatformClient } from "../src/platform.js";

describe("quote_template's list columns", () => {
  let platform: PlatformClient;
  beforeAll(() => {
    platform = createPlatformClient(inject("dbUrls").platform);
  });
  afterAll(async () => {
    await platform.$disconnect();
  });

  it("are NOT NULL", async () => {
    const rows = await platform.$queryRaw<{ column_name: string; is_nullable: string }[]>`
      SELECT column_name::text, is_nullable::text FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'quote_template'
        AND column_name IN ('room_types', 'weekly_days', 'departure_months')
      ORDER BY column_name`;
    expect(rows).toEqual([
      { column_name: "departure_months", is_nullable: "NO" },
      { column_name: "room_types", is_nullable: "NO" },
      { column_name: "weekly_days", is_nullable: "NO" },
    ]);
  });
});

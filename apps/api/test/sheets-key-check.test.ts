// Every process that holds SHEETS_HASH_KEY compares it, at start-up, with the one the first process stored (SC8): the
// same key passes, a different one is refused naming the variable and never printing either key.
import { createDatabase, type Database } from "@travel-crm/db";
import { createIsolatedDatabase, type IsolatedDatabase } from "@travel-crm/db/testing";
import { sheetsKeyChecks } from "@travel-crm/db/sheets-key-check";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { sheetsHashKeyCheckValue } from "../src/sheets-settings.js";
import { SheetsKeyMismatchError, verifySheetsKey } from "../src/sheets-key-check.js";

const key = "rQ7vK2mXz9LpT4wNb8Ys5HdJ3cFe6UgA";
const otherKey = "wB7qk2Rz9XvLm4TnY8cPa5HdJ3sFe6Ug";

describe("verifySheetsKey", () => {
  let isolated: IsolatedDatabase;
  let db: Database;

  beforeAll(async () => {
    isolated = await createIsolatedDatabase(inject("dbUrls"));
    db = createDatabase(isolated.urls.runtime, { maxConnections: 2 });
  });

  afterAll(async () => {
    await db.disconnect();
    await isolated.drop();
  });

  it("stores the check value when no process has, and accepts the same key after that", async () => {
    expect(await verifySheetsKey(db, key)).toBe("stored");
    expect(await verifySheetsKey(db, key)).toBe("matches");
    const rows = await db.withoutOrg((tx) => sheetsKeyChecks(tx).findMany());
    expect(rows).toHaveLength(1);
    expect(Buffer.from(rows[0]?.checkValue ?? []).equals(sheetsHashKeyCheckValue(key))).toBe(true);
  });

  it("refuses a different key, naming SHEETS_HASH_KEY and printing neither key", async () => {
    const error = await verifySheetsKey(db, otherKey).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SheetsKeyMismatchError);
    const message = (error as Error).message;
    expect(message).toMatch(/SHEETS_HASH_KEY/);
    expect(message).not.toContain(key);
    expect(message).not.toContain(otherKey);
    expect(message).not.toContain(sheetsHashKeyCheckValue(key).toString("hex"));
  });

  it("lets two first processes race: one stores, the other compares with what is stored", async () => {
    const racing = await createIsolatedDatabase(inject("dbUrls"));
    const racingDb = createDatabase(racing.urls.runtime, { maxConnections: 4 });
    try {
      const outcomes = await Promise.allSettled([
        verifySheetsKey(racingDb, key),
        verifySheetsKey(racingDb, otherKey),
        verifySheetsKey(racingDb, key),
      ]);
      // Whichever key was stored first wins; the processes with the other key are refused.
      const accepted = outcomes.filter((outcome) => outcome.status === "fulfilled").length;
      expect([1, 2]).toContain(accepted);
      expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(3 - accepted);
      expect(await racingDb.withoutOrg((tx) => sheetsKeyChecks(tx).count())).toBe(1);
    } finally {
      await racingDb.disconnect();
      await racing.drop();
    }
  });
});

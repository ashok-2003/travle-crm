// The start-up check that every process holds the same SHEETS_HASH_KEY (SC8). The claims and an erased customer's
// tombstones are keyed with it, so a console and a worker holding different keys would quietly stop matching. The first
// process stores an HMAC of a constant; every process compares its own with it. Neither key is ever printed.
import { timingSafeEqual } from "node:crypto";
import type { Database } from "@travel-crm/db";
import { sheetsKeyChecks } from "@travel-crm/db/sheets-key-check";
import { sheetsHashKeyCheckValue } from "./sheets-settings.js";

export class SheetsKeyMismatchError extends Error {
  constructor() {
    super(
      "SHEETS_HASH_KEY: differs from the key the other processes use (or the key that was first stored). " +
        "Give the api, the worker and the console the same value, and never change it once sheets are connected.",
    );
    this.name = "SheetsKeyMismatchError";
  }
}

/**
 * Stores the key's check value if none is stored (a race between first processes keeps one), then compares: "stored"
 * for the process that wrote it, "matches" for one that found the same value, and SheetsKeyMismatchError otherwise.
 */
export async function verifySheetsKey(db: Database, key: string): Promise<"stored" | "matches"> {
  const mine = sheetsHashKeyCheckValue(key);
  return db.withoutOrg(async (tx) => {
    const { count } = await sheetsKeyChecks(tx).createMany({
      data: [{ checkValue: new Uint8Array(mine) }],
      skipDuplicates: true,
    });
    const stored = await sheetsKeyChecks(tx).findFirst({ select: { checkValue: true } });
    const theirs = stored === null ? null : Buffer.from(stored.checkValue);
    if (theirs?.length !== mine.length || !timingSafeEqual(theirs, mine)) {
      throw new SheetsKeyMismatchError();
    }
    return count === 1 ? "stored" : "matches";
  });
}

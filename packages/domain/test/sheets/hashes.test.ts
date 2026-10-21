// The hashes the sheets keep: a row's identity, the keyed hashes, ids made from text, and the spread over accounts.
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { accountIndexFor, createSheetsHashes, rowHash, uuidFromText } from "../../src/sheets/index.js";

const key = "k".repeat(40);
const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");

describe("rowHash", () => {
  it("hashes a row as the SHA-256 of its trimmed cells, trailing empties dropped", () => {
    expect(hex(rowHash(["a ", " b", "", ""]))).toBe(hex(rowHash(["a", "b"])));
    expect(hex(rowHash(["a", "", "b"]))).not.toBe(hex(rowHash(["a", "b"])));
    expect(hex(rowHash(["a", null, null]))).toBe(hex(rowHash(["a"])));
    expect(hex(rowHash(["a", "b"]))).toBe(createHash("sha256").update('["a","b"]').digest("hex"));
    expect(rowHash(["Asha"])).toHaveLength(32);
  });

  it("tells two different rows apart, and keeps the case and the leading zero", () => {
    expect(hex(rowHash(["Asha", "098765 43210"]))).not.toBe(hex(rowHash(["Asha", "98765 43210"])));
    expect(hex(rowHash(["asha"]))).not.toBe(hex(rowHash(["Asha"])));
  });
});

describe("createSheetsHashes", () => {
  it("keys the spreadsheet, contact and re-key hashes with the key, and kind-prefixes contacts", () => {
    const hashes = createSheetsHashes(key);
    const other = createSheetsHashes("o".repeat(40));
    expect(hashes.spreadsheetHash("sheet-id")).toHaveLength(32);
    expect(hex(hashes.spreadsheetHash("sheet-id"))).toBe(hex(createSheetsHashes(key).spreadsheetHash("sheet-id")));
    expect(hex(hashes.spreadsheetHash("sheet-id"))).not.toBe(hex(other.spreadsheetHash("sheet-id")));
    expect(hex(hashes.contactHash("phone", "+919876543210"))).not.toBe(
      hex(other.contactHash("phone", "+919876543210")),
    );
    expect(hex(hashes.contactHash("phone", "+919876543210"))).not.toBe(
      hex(hashes.contactHash("email", "+919876543210")),
    );
    const plain = rowHash(["Asha"]);
    expect(hex(hashes.rekey(plain))).not.toBe(hex(plain));
    expect(hex(hashes.rekey(plain))).toBe(hex(createSheetsHashes(key).rekey(plain)));
    expect(hex(hashes.rekey(plain))).not.toBe(hex(other.rekey(plain)));
  });

  it("refuses a key under 32 characters", () => {
    expect(() => createSheetsHashes("short")).toThrow(RangeError);
  });
});

describe("uuidFromText and accountIndexFor", () => {
  it("makes a UUID from text alone", () => {
    expect(uuidFromText("sheet-import:abc")).toBe(uuidFromText("sheet-import:abc"));
    expect(uuidFromText("sheet-import:abc")).not.toBe(uuidFromText("sheet-import:abd"));
    expect(uuidFromText("x")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("spreads connections over the accounts", () => {
    const counts = [0, 0, 0];
    for (let index = 0; index < 1000; index += 1) {
      const id = uuidFromText(`connection-${String(index)}`);
      const account = accountIndexFor(id, 3);
      expect(accountIndexFor(id, 3)).toBe(account);
      counts[account] = (counts[account] ?? 0) + 1;
    }
    for (const count of counts) {
      expect(count).toBeGreaterThan(250);
      expect(count).toBeLessThan(420);
    }
    expect(accountIndexFor(uuidFromText("only"), 1)).toBe(0);
    expect(() => accountIndexFor("x", 0)).toThrow(RangeError);
  });
});

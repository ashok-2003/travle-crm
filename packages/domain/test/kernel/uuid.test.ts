// Ids made in code are UUID v7 (RFC 9562), as Prisma's @default(uuid(7)) makes them: time-ordered, so they index like
// the database's, and made without Postgres 18's uuidv7(), so the product runs on Postgres 17 too.
import { describe, expect, it } from "vitest";
import { isUuid, newUuidV7 } from "../../src/kernel/index.js";

describe("newUuidV7", () => {
  it("is a UUID of version 7 with RFC 9562's variant", () => {
    const id = newUuidV7();
    expect(isUuid(id)).toBe(true);
    expect(id[14]).toBe("7");
    expect(["8", "9", "a", "b"]).toContain(id[19]);
  });

  it("holds the millisecond it was made in its first 48 bits", () => {
    const at = Date.UTC(2026, 9, 18, 12, 30, 45, 678);
    const id = newUuidV7(at);
    expect(Number.parseInt(id.slice(0, 8) + id.slice(9, 13), 16)).toBe(at);
  });

  it("sorts ids made later after ids made earlier", () => {
    const earlier = newUuidV7(Date.UTC(2026, 9, 18, 0, 0, 0, 1));
    const later = newUuidV7(Date.UTC(2026, 9, 18, 0, 0, 0, 2));
    expect(earlier < later).toBe(true);
  });

  it("makes a different id each time, even in the same millisecond", () => {
    const at = Date.now();
    const ids = new Set(Array.from({ length: 1000 }, () => newUuidV7(at)));
    expect(ids.size).toBe(1000);
  });
});

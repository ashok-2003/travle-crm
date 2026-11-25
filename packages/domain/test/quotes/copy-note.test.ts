// Copying a notes line to other trips against the real database: first in the notes, audited, skipped when already there or
// too long, and refused for an id that isn't the agency's.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { copyNoteToPackages } from "../../src/quotes/index.js";
import { openWorld, type World } from "../bookings/support.js";

describe("copying a notes line", () => {
  let world: World;
  let other: World;
  let counter = 0;
  beforeAll(async () => {
    world = await openWorld("Copy note");
    other = await openWorld("Copy note elsewhere");
  });
  afterAll(async () => {
    await world.close();
    await other.close();
  });

  const aPackage = (notes: string, on: World = world) => {
    counter += 1;
    return on.inOrg(async (tx) => {
      const row = await tx.quoteTemplate.create({
        data: { name: `Note trip ${String(counter)}`, title: "Trip", kind: "group", notes },
        select: { id: true },
      });
      return row.id;
    });
  };
  const notesOf = (id: string) =>
    world.inOrg(
      async (tx) => (await tx.quoteTemplate.findUniqueOrThrow({ where: { id }, select: { notes: true } })).notes,
    );
  const copy = (line: string, packageIds: string[]) =>
    world.inOrg((tx) => copyNoteToPackages(tx, world.manager, { line, packageIds }));

  it("puts the line first in each chosen trip's notes, with a package.note-copied audit entry", async () => {
    const withNotes = await aPackage("Carry cash.");
    const empty = await aPackage("");
    const result = await copy("Pets are not allowed.", [withNotes, empty]);
    expect(result).toEqual({ copied: [withNotes, empty], alreadyThere: [], tooLong: [] });
    expect(await notesOf(withNotes)).toBe("Pets are not allowed.\nCarry cash.");
    expect(await notesOf(empty)).toBe("Pets are not allowed.");
    const audits = await world.inOrg((tx) =>
      tx.auditEntry.count({ where: { action: "package.note-copied", entityId: { in: [withNotes, empty] } } }),
    );
    expect(audits).toBe(2);
  });

  it("skips a trip whose notes already have the line", async () => {
    const has = await aPackage("Carry cash.\nPets are not allowed.");
    const result = await copy("Pets are not allowed.", [has]);
    expect(result).toEqual({ copied: [], alreadyThere: [has], tooLong: [] });
    expect(await notesOf(has)).toBe("Carry cash.\nPets are not allowed.");
  });

  it("skips a trip whose notes would pass 3,000 characters", async () => {
    const long = await aPackage("x".repeat(2_990));
    const result = await copy("Pets are not allowed.", [long]);
    expect(result).toEqual({ copied: [], alreadyThere: [], tooLong: [long] });
    expect((await notesOf(long)).length).toBe(2_990);
  });

  it("refuses an id that isn't one of the agency's packages", async () => {
    const mine = await aPackage("");
    const theirs = await aPackage("", other);
    await expect(copy("A line.", [mine, theirs])).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await notesOf(mine)).toBe("");
  });
});

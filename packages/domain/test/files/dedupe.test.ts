// Which of the files the clean-up finds share their bytes, and which one keeps them: only files storage gives the same
// ETag and the promised size for (a missing object, a missing ETag or another size is left alone), and the holder is a
// live file on a record that lasts (not removed, not an AI input), not a WhatsApp message's if it can, then the oldest.
import type { StoredObject } from "@travel-crm/integrations/storage";
import { describe, expect, it } from "vitest";
import { identicalSets, type DuplicateCandidate } from "../../src/files/index.js";

const organizationId = "0199e7a0-0000-7000-8000-00000000a000";
const idOf = (n: number) => `0199e7a0-0000-7000-8000-00000000a0${String(n).padStart(2, "0")}`;

/** Storage that answers `head` from a list, by attachment id; nothing for the others. */
const storageWith = (objects: Record<string, StoredObject>) => ({
  head: (key: string) => Promise.resolve(objects[key.slice(key.lastIndexOf("/") + 1)] ?? null),
});

const file = (n: number, recordType: string, deleted = false): DuplicateCandidate => ({
  id: idOf(n),
  recordType,
  sizeBytes: 10,
  deleted,
});
const object = (etag: string | null, sizeBytes = 10): StoredObject => ({ sizeBytes, contentType: "image/png", etag });

describe("the clean-up's sets of identical files", () => {
  it("leaves alone a file with no object, no ETag or another size, and joins the rest", async () => {
    const group = [file(1, "lead"), file(2, "lead"), file(3, "lead"), file(4, "lead"), file(5, "lead")];
    const storage = storageWith({
      [idOf(1)]: object("same"),
      [idOf(2)]: object("same"),
      [idOf(3)]: object(null),
      [idOf(4)]: object("same", 11),
    });
    expect(await identicalSets(storage, organizationId, [group])).toEqual([
      { holderId: idOf(1), sharerIds: [idOf(2)], sizeBytes: 10 },
    ]);
  });

  it("keeps the bytes on a live file of a lasting record, a WhatsApp message's only if none is, then the oldest", async () => {
    const everyOne = (n: number[]) => Object.fromEntries(n.map((i) => [idOf(i), object("same")]));
    const removedFirst = [file(1, "trip_kit", true), file(2, "ai_input"), file(3, "whatsapp_message")];
    const leadLast = [file(4, "whatsapp_message"), file(5, "ai_input"), file(6, "lead"), file(7, "lead")];
    const sets = await identicalSets(storageWith(everyOne([1, 2, 3, 4, 5, 6, 7])), organizationId, [
      removedFirst,
      leadLast,
    ]);
    expect(sets.map((set) => set.holderId)).toEqual([idOf(3), idOf(6)]);
  });
});

// A stand-in, with the same signature, for the storage port's deletePrefix(prefix), which fixer D's branch adds
// (plan 4's fix wave): this branch's port lacks it. The controller deletes this file at merge and calls
// storage.deletePrefix(prefix) where it is used.
import type { ObjectStorage } from "@travel-crm/integrations/storage";

/** Deletes everything stored under the prefix, and returns how many: the port's own method once it has one. */
export async function deletePrefix(storage: ObjectStorage, prefix: string): Promise<number> {
  const port = storage as ObjectStorage & { deletePrefix?: (prefix: string) => Promise<number> };
  return port.deletePrefix ? port.deletePrefix(prefix) : 0;
}

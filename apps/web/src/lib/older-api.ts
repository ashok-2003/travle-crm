// What an older api, the release before, may leave out of an answer while a release rolls out: the web can be served
// before the api runs the new code (docs/deploy-checklist.md), so a field this release added is read as possibly missing,
// and the screen then behaves as it did before the release. Kept until the next release, when every api sends it.

/** The field as an older api may send it: missing altogether. */
export function mayBeMissing<T>(value: T): T | undefined {
  return value;
}

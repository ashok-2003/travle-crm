# catalog

The agency's own catalog (spec 6, layer L0): destinations for now, which quotes will use too. It calls no business
module above it.

## Public functions (`index.ts`)

- `findOrAddDestination(tx, actor, name)`: the destination a typed name means. A live one of that name in any case,
  else the one a merged destination of that name went into (R34), else a new one. Two saves of a new name at once add
  it once: the insert skips a clash on `destination_name_live` (unique live names, ignoring case, R2) and reads the
  other's row. Adding records `destination.added`.
- `destinationById(tx, id)`: the destination, or the one it was merged into; null when it leads nowhere live.
- `searchDestinations(tx, { query?, limit })`: live destinations alphabetically, by part of the name or a near miss
  (`pg_trgm`'s word similarity, `<%`); `%` and `_` are letters.
- `renameDestination(tx, actor, { destinationId, name })`: refuses a name another live destination has in any case
  (`DESTINATION_NAME_TAKEN`), also when another destination is renamed to it at the same moment; a missing one is
  `NOT_FOUND`. Records `destination.renamed`.
- `mergeDestination(tx, actor, { destinationId, intoDestinationId })`: deletes the first and points it at the second
  (`MERGE_INTO_ITSELF`, `NOT_FOUND`). Records `destination.merged`. Call crm's `mergeDestinations`, which also moves
  the leads and repeat enquiries. Both rows are locked `FOR NO KEY UPDATE`, in id order: a trip naming one of them
  (its key check takes `KEY SHARE`) goes through rather than deadlock with the merge moving its lead.
- `destinationNames(tx, ids)`: names by id, deleted and merged ones included, for pages that show old records.

Renaming and merging need `settings:manage`; searching needs `leads:view` (the api checks both).

## Events

`destination.added` and `destination.renamed` (`{ destinationId }`), `destination.merged`
(`{ destinationId, intoDestinationId }`), each with the audit action of the same name.

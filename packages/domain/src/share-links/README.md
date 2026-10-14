# share-links

Links that open one record for someone who isn't signed in (spec 9.3), such as a customer opening a quotation:
`/p/<token>`.

## Public functions and values (`index.ts`)

- `createShareLink(tx, actor, { recordType, recordId, label, expiresAt? })`: makes a link and returns
  `{ shareLinkId, token, path }`. The token is shown once. Expires in 30 days unless `expiresAt` says otherwise;
  `null` never expires. The caller checks the actor may share the record.
- `revokeShareLink(tx, actor, { shareLinkId })`: turns the link off for good.
- `findShareLink(db, token, now?)`: checks the link and returns the `OpenedShareLink` (organization, record, label, who
  made it), recording nothing. Unknown, expired and revoked links are `NOT_FOUND` with reason `LINK_NOT_FOUND`,
  `LINK_EXPIRED` or `LINK_REVOKED`.
- `recordShareLinkOpen(db, opened, { ipAddress, userAgent, preview }, now?)`: records the open and publishes
  `share-link.opened` in one transaction. Every open is recorded; the event goes out at most once per link in 10
  minutes. A preview (`preview: true`: HEAD, prefetch, link-preview bots) records nothing. The route calls it only
  after the record's resolver answered with success.
- `openShareLink(db, token, visitor, now?)`: `findShareLink` then `recordShareLinkOpen`.
- `listShareLinks(tx, { recordType, recordId })`: a record's links with open counts and the last open, for staff.
- Types: `NewShareLink`, `OpenedShareLink`, `SharedRecord`, `ShareLinkVisitor`.

The route is `shareLinkRoutes(...)` in `apps/api/src/share-link-route.ts`; each shareable record type registers a
resolver there that shows the record.

## Events

- `share-link.opened`, payload `{ shareLinkId, openId }` (`shareLinkOpenedEvent` in `@travel-crm/contracts/share-links`):
  someone opened a link.

## Rules worth knowing

- A token is the organization's id (22 characters) then a random secret (43): `/p/<token>` opens the organization
  with `db.forOrg()`, never looking across organizations. Only the secret's sha256 is stored.
- Links are revoked, never edited or deleted: the runtime role may set only `revoked_at` and `revoked_by`, and a trigger
  makes revocation final (a revoked link can't be changed). Opens are append-only.
- An open keeps the visitor's network (IPv4 /24, IPv6 /48) and a User-Agent of at most 300 characters, not their
  exact address.

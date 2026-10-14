## What changed

## Why

## How it was tested

<!-- The commands you ran and what they printed. "pnpm check" at minimum. -->

## Checklist

- [ ] `pnpm check` is green
- [ ] New table with `organization_id`? Its migration calls `app_enable_org_rls`, and it has an entry in `packages/db/test/org-table-fixtures.ts`
- [ ] A decision others will ask "why?" about has an ADR in `docs/adr/`
- [ ] No secrets, `.env` files or personal data in the diff

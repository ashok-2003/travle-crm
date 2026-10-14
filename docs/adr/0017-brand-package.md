# 0017: The brand package

Date: 2026-10-15 · Status: accepted · Implements spec section 10

## Decision

- **`@travel-crm/brand` is the one source of the product's identity**: its name, short name, tagline, colours, fonts,
  contacts and logo files. Every layer may read it; it reads no other package (dependency-cruiser,
  `brand-depends-on-nothing-of-ours`).
- **The product name appears nowhere else.** `packages/brand/test/product-name.test.ts` reads every file git tracks
  or would track and fails on any line holding `brand.productName` or `brand.shortName`, in any letter case or
  spacing, outside `packages/brand/` and `docs/`. Being a test, it runs in `pnpm check` and CI (spec 12.1, gate 3).
  - `docs/` is exempt because the spec and plans name the product on purpose, as the working name (open item Q8).
  - Binary files are skipped: they can't carry the name as text.
- **The api's authenticator label** (`appName` in `apps/api/src/environment.ts`) is `brand.productName`.
- **The logo is a placeholder mark** (`assets/logo.svg`, `assets/logo-dark.svg`): a route from a start point to a
  destination, ink and warm white, drawn with paths only so tools without fonts can render it. A designed logo
  replaces the two files; nothing else changes.

## Context

- **Why a test and not a lint rule.** The name can appear in any file type (Markdown, JSON, YAML, HTML), not only in
  TypeScript. A test over git's file list covers them all with no extra tooling, and its failure lists file and line.
- **Why `git ls-files`.** It is the set CI checks out: ignored files (`node_modules`, `dist`, `.env`) are left out, and
  new files are checked before they are committed.

## Consequences

- Renaming the product (Q8) is an edit to `packages/brand/src/brand.ts` and nothing else in code.
- An organization's own logo, colours and terms on its quotes and invoices are settings in the database, never brand
  values; the PDF and email layouts take both.

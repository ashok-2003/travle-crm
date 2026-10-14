# 0001: Toolchain versions

Date: 2026-10-14 · Status: accepted

## Decision

Node 24 LTS, pnpm 12.11.2, Turborepo 2.11.8, **TypeScript 6.0.3**, **Prisma 7.10.0**, Vitest 5, ESLint 10 with typescript-eslint 8.71, Postgres 18.

## Context

- **TypeScript 7.0 (the native compiler) is out but not used yet.** typescript-eslint 8.71 refuses it ("does not support TS 7.0"),
  and TS 7 has no JavaScript compiler API yet. Running TS 7 for type-checking alongside TS 6 for linting works but is
  harder to understand. TypeScript 6.0.3 is the newest single version that every tool accepts. Revisit when typescript-eslint supports TS 7.
- **Prisma is pinned exactly** because npm's `latest` tag for `prisma` points at an 8.0 release candidate.
- **Prisma 7 does not load `.env` itself.** `prisma.config.ts` loads the root `.env` with dotenv, and reads the URL from
  `process.env` so `prisma generate` works without a database (CI).
- **`prisma generate` is never implicit in Prisma 7.** Turbo runs it before typecheck, lint and test.
- **pnpm 12 blocks install scripts** unless approved in `allowBuilds` (pnpm-workspace.yaml).

## Consequences

One compiler, one lint toolchain, reproducible installs. Upgrading TypeScript or Prisma is a deliberate change with its own ADR.

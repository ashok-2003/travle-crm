# 0003: Repository conventions

Date: 2026-10-14 · Status: accepted

## Decision

- **Prettier** formats code (width 120); **ESLint** catches mistakes; `.editorconfig` covers editors.
- **husky + lint-staged** run both on staged files before every commit.
- **commitlint** enforces Conventional Commits and rejects `Co-Authored-By` trailers.
- **Renovate** proposes dependency updates weekly, with guards for Prisma 8 and TypeScript 7.
- A pull request template asks how each change was tested.

## Context

The owner asked for the conventions of well-run open-source monorepos, and most code is written by AI agents, so
the rules must be enforced by tools rather than remembered. Not adopted, because they serve published libraries
and this is a private application: Changesets, semantic-release, per-package versioning and a public LICENSE
(`"license": "UNLICENSED"` instead).

## Consequences

Every commit in the history is formatted, linted and conventionally described. Renovate starts working once the
repo is on GitHub.

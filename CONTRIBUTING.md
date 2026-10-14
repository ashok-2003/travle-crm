# Contributing

The conventions every change follows are in [CLAUDE.md](CLAUDE.md). This page covers the workflow.

## Setup

See [Run it locally](README.md#run-it-locally). `pnpm install` also installs the git hooks.

## Making a change

1. Branch from `main` (`feat/<topic>`, `fix/<topic>`).
2. Write the failing test first, then the code.
3. Commit in small steps. Messages follow [Conventional Commits](https://www.conventionalcommits.org): `feat(db): …`, `fix: …`, `docs: …`.
4. Run `pnpm check` and open a pull request; the template asks how you tested it.

## Git hooks

- **pre-commit:** formats staged files with Prettier and fixes lint problems with ESLint.
- **commit-msg:** rejects messages that aren't Conventional Commits, and `Co-Authored-By` trailers.

Never skip them with `--no-verify`. If a GUI git client can't find Node, create `~/.config/husky/init.sh`
containing `source ~/.nvm/nvm.sh && nvm use 24 >/dev/null`.

# The installed app's icon, boot screen and install banner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Installed apps on Android update to the six-petal icon by themselves, the boot screen is black with the petals,
and phones in a browser see a dismissable "works best in the app" bar.

**Architecture:** Task 1 is the brand package (renderer, `pwaIcons`, startup images) plus the web app's manifest, page
head and service worker push icon. Task 2 is a client component in the agency app's frame plus an early listener for
Chrome's `beforeinstallprompt`. They run in parallel worktrees and only meet in `manifest.ts` (Task 1 owns it, including
`related_applications`).

**Tech Stack:** Next.js 16.4 (never `next upgrade`), React 19, Tailwind v4, shadcn radix-nova registry, next-intl,
`@resvg/resvg-js` (brand build only), Vitest.

**Spec:** `docs/superpowers/specs/2026-11-25-pwa-icon-splash-banner-design.md`

## Global Constraints

- CLAUDE.md binds: product name, colours and logo only from `@travel-crm/brand`; registry components only; no
  `border`/`divide-`/`ring-`/`shadow` classes outside `components/ui`; brand tokens; every word in a messages file; 44px
  targets; test first; strict TypeScript; one-line purpose comment atop each file; least code.
- Icons are build outputs (`packages/brand` renders `dist/icons`, `apps/web/scripts/brand-icons.ts` copies them to the
  gitignored `public/icons`); never commit rendered PNGs.
- Commits: Conventional, lowercase subject, header ≤ 100 characters, staged by name, no Co-Authored-By, never push.

## Review Focus

1. A phone that installed the app before: the manifest's icon addresses all change at once, and nothing still asks for an
   old name (a 404 icon in a push notification or the page head).
2. The bar inside the installed app on either phone: never shows.
3. Chrome fires `beforeinstallprompt` before React mounts: the Install button still works on the first page load.
4. iPad (iPadOS reports a Mac user agent): treated as iOS Safari when it has touch, or shows nothing; never a broken Install.
5. Storage blocked (private mode): the bar works and × hides it for the page's life.

---

### Task 1: Versioned icons, the black splash, iPhone startup screens

**Files:** `packages/brand/scripts/render-icons.ts`, `packages/brand/src/icons.ts`, `packages/brand/test/icons.test.ts`
(and the brand's other tests that name icon files), `apps/web/src/app/manifest.ts` (+ its test), `apps/web/src/app/layout.tsx`
(apple icon and `appleWebApp.startupImage`), `apps/web/src/service-worker/push.ts` (+ its test), README/DESIGN.md lines
that name the files.

**Interfaces:** `pwaIcons` names the `-v2` files; a new `appleStartupImages: readonly { url: string; media: string }[]`
exported from the brand's data entry for the layout.

- [ ] Failing tests: the renderer's output names (`icon-192-v2.png`, `icon-512-v2.png`, `icon-maskable-512-v2.png`,
  `apple-touch-icon-v2.png`, the favicons unchanged) and one startup PNG per listed iPhone size (portrait, ink background,
  the mark centred at about a third of the width); `pwaIcons` and `appleStartupImages` agree with the files; the manifest
  has `background_color` ink, `theme_color` canvas, `related_applications: [{ platform: "webapp", url: "/manifest.webmanifest" }]`
  and the new icons; the push notification's icon is `/icons/icon-192-v2.png`.
- [ ] Implement; `pnpm --filter @travel-crm/brand build`, then the web app's `generate` script, and check `public/icons`
  holds the new files; run the brand and web tests, typecheck and lint.
- [ ] Commit `feat(brand): versioned app icons, a black boot screen and iphone startup screens`.

### Task 2: The "works best in the app" bar

**Files:** create `apps/web/src/shell/install-banner.tsx` (the bar) and `apps/web/src/shell/use-install-state.ts` (the
state), mount it at the top of the agency app's frame (`apps/web/src/components/app-frame.tsx` or `app/(app)/layout.tsx`),
an early `beforeinstallprompt` listener (kept on `window` before React mounts, e.g. a tiny inline script in the root
layout's head, or a module imported by the root layout), words in `apps/web/src/i18n/messages/en-IN/shell.json`; tests in
`apps/web/test/shell/`.

**Interfaces:** `useInstallState(): "none" | "installable" | "installed" | "ios"` and `promptInstall(): Promise<void>`.

- [ ] Failing tests for each state in the spec (stub `matchMedia`, `navigator.standalone`, the user agent and touch,
  `getInstalledRelatedApps`, and a saved `beforeinstallprompt` event): the words, the Install button calling `prompt()`,
  × hiding it and the 14-day return (fake timers), storage blocked; the bar never renders on a computer width, in the
  console, or on the public pages.
- [ ] Implement with registry pieces (a thin `Item`/`Alert`-like bar, `Button`, the × as an icon button with a 44px hit
  area named "Hide"); run the tests, typecheck, lint; shots at 390px of the three visible states (a throwaway spec or the
  audit camera) to the scratchpad's `shots/pwa-*.png`.
- [ ] Commit `feat(web): a bar on phones in a browser saying the app works best installed`.

# 0025: The platform console's screens

Date: 2026-10-16 · Status: accepted · Implements spec sections 6.1, 7 and 11 (the platform console) over ADR 0019's api

## Decision

- **The console is a section of the web app, at `/console`** (`apps/web/src/app/console/**`, its code in
  `apps/web/src/console/**`), not an app of its own. Support's impersonation needs it: Better Auth swaps the session
  cookie at `/api/auth`, so the agency app must be on the address that set it; and spec 3 puts every browser call on
  the address the app was loaded from. It reuses the web app's components, words, tokens, fonts, security headers and
  journeys.
- **Kept apart inside the app.** The console has its own TanStack `QueryClient`, held in memory only (nothing it reads
  reaches IndexedDB), cleared on sign-out, and its own tRPC client at `/api/platform/trpc`, typed by
  `type PlatformRouter` alone. dependency-cruiser keeps the rest of the app from importing `src/console/**` and the
  console from importing anything of `@travel-crm/api/platform` but its type. The service worker never keeps a
  console page.
- **Routing.** The web app rewrites `/api/platform/:path*` to `CONSOLE_ORIGIN` (default `http://localhost:3002` in
  development) before `/api/:path*`; it also sends `/p/:path*` and `/webhooks/:path*` to the api, because share links
  are opened on the app's address. Like `API_ORIGIN`, `CONSOLE_ORIGIN` is fixed when the app is built: a deployment
  routes these paths at its load balancer (`docs/deploy-checklist.md`).
- **One sign-in page.** Platform staff sign in by email on the sign-in page everyone uses (spec 6.3) and land on
  `/console`: the agency's session gate sends platform staff there. The step screens (a new password, two-factor setup,
  the two-factor code) serve them too and come back through `?next=`; the console sends a 401 to sign-in, and
  `CHANGE_PASSWORD` or `SET_UP_TWO_FACTOR` to the step's screen, each with the page to return to.
- **Two-factor is required of platform staff.** `staffProcedure` refuses `SET_UP_TWO_FACTOR` after `CHANGE_PASSWORD`,
  and Better Auth's `/admin/impersonate-user` side door refuses staff without it, so support can't impersonate around
  the console. The staff list says who still has to replace a temporary password or set up two-factor.
- **Platform staff never keep a trusted device.** Better Auth lets anyone who ticks "Don't ask again on this device"
  skip the code for 30 days, renewed at every sign-in. For platform staff (support and super admins) the api ignores
  the request rather than refusing it, as the challenge screen can't know who is signing in: a plugin beside the side
  doors (`packages/domain/src/identity/auth/staff-trusted-devices.ts`) sends `trustDevice: false` on
  `/two-factor/verify-totp`, `/verify-backup-code` and `/verify-otp` for the person the signed `two_factor` cookie
  names, and deletes their trusted devices at every password sign-in, so one trusted before they became staff lapses.
  Platform staff type their code at every sign-in; an organization's members keep the 30 days.
- **Impersonation** starts on an organization's page: its active members (`organizations.members`), a confirmation
  that it is recorded in the organization's audit log and lasts at most an hour, then a full load of `/` as the
  member. The agency's banner shows a Stop button, which ends it, wipes what the device holds and opens `/console`.
  The side door refuses a member with a step still to take, a temporary password or the two-factor their
  organization requires (`TARGET_HAS_PENDING_STEP`): the app would hold support at the step's screen, which needs the
  member's own password. The dialog says why and stays open.
- **The screens:** the dashboard (every organization a page at a time: status as a dot and a word, days left, seats,
  last activity, this month's use); onboarding; an organization's page (its record and corrections, its business
  profile, its members with the Owner's invite resent, its subscription: today's state beside the recorded one, the
  price with one GST row at 18% (Ruling C: CGST and SGST, or IGST, are split once the platform's own GSTIN and state
  are set, with tax invoices), plan, overrides, trial end, paid-through, payments recorded and voided, suspension,
  lifting it (super admins), cancelling); data protection (super admins: exports and their downloads, the purge with
  the code typed, one person's or record's export and erasure); plans and the subscription policy (support reads,
  super admins change); failed jobs, schedules and the platform log; platform staff (super admins). Amounts are typed
  in rupees and read into paise by the contracts.
- **Time zones.** What belongs to the platform shows in its own zone, Asia/Kolkata (`PLATFORM_TIME_ZONE`): the
  dashboard's last activity, failed jobs, the platform log, data protection's exports, platform staff. What belongs to
  an organization shows in that organization's zone: on its page, its members' last activity, the day it was
  onboarded and a suspension's day. The subscription's days (trial end, paid-through, payments) are calendar days of
  the organization, shown as they are, never moved by a zone; a schedule shows its own zone beside it.

## Two-factor is off (owner, 2026-10-16)

The owner turned two-factor off for now: not worth the hassle for an agency's staff yet. One code constant,
`features.twoFactor` in `packages/contracts/src/features/index.ts`, is `false`. Off, Better Auth's two-factor plugin
and the staff trusted-device plugin aren't registered, so nobody is asked for a code and `/api/auth/two-factor/*` is a
404; `staffProcedure` and the impersonation side door don't ask for two-factor; a newcomer goes from the temporary
password straight to the console; and the console's staff list and its words don't mention it. The decisions above
about two-factor and trusted devices hold again once it is `true`: the code, the database columns and the tests that
prove them (they turn the switch on with `vi.mock`) all stay, and the journeys follow the constant.

**The risk:** platform staff, who reach every organization's data, sign in with a password alone. Turn it back on for
platform staff before real agencies use the product.

## Context

ADR 0019 made the console its own process with its own tRPC and left its screens to plan 5. Spec 11 lists them; spec
6.1 asks that support's impersonation show a banner and be written to the organization's log; the controller ruled
that platform staff must use two-factor. A separate Next.js app would have needed its own origin (and a session shared
across subdomains for impersonation), a `packages/ui` for the components and a second journeys harness.

## Consequences

- The console's bundle ships in the web image; its pages are code-split, so the agency's screens never load it.
- Moving it to an app of its own later means moving `src/console/**` and `src/app/console/**`, the shared components
  to `packages/ui`, and sharing the session across subdomains (a few days).
- The challenge screen hides "Don't ask again" on the way to the console, but a sign-in begun at `/sign-in` can't know
  it is platform staff's and still offers it; for them ticking it does nothing.
- Better Auth 1.7.7 records no TOTP code as used (`plugins/two-factor/totp/index.mjs:186-194`) and accepts the steps
  either side of now (`@better-auth/utils`'s `verifyTOTP`, window 1), so one code works again for up to about 90
  seconds: a code seen over someone's shoulder works once more if their password is known too. It is upstream; the
  journeys rely on it (`apps/web/test/e2e/support/console.ts`).
- The journeys start the api, the worker and the console process, and sign platform staff in with two-factor on
  while it is on.

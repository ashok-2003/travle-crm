# identity

Who can sign in, to which organization, and what they may do (spec section 6).

## Public functions and values (`index.ts`)

- `createIdentity(options)` builds the module once per process. The `Identity` it returns has:
  - `auth`: Better Auth (serve `auth.handler`, read sessions with `auth.api.getSession`);
  - `resolveAccess(userId, organizationId, session?)`: the member's role, permissions and pending steps, or null.
    Pass the session's `impersonatedBy`: the access is an `Actor` whose `source` is then `impersonation`;
  - `describeSignedInPerson(session)`: what `me.get` returns;
  - `isPlatformAdmin(user)`, and `describePlatformStaff(userId)`: the person's platform level (`support` or
    `super-admin`), name and pending password change, or null for anyone who isn't platform staff;
  - `organizationProfile(organizationId)` and `memberContacts(organizationId, userIds)`: what other modules may know
    about an organization and its people (they can't read the sign-in tables);
  - `staff.list / create / updateRole / resetPassword / remove`;
  - with `auth.passwordReset` set (the api passes its email sender and the web app's reset page), Better Auth's
    password reset by email link; staff without email are never emailed, a link may lead back only to the reset page,
    and a reset ends every session the person had;
  - `roles.list / create / update / delete`;
  - `settings.setTwoFactorRequirement`;
  - `seedStarterRoles(organizationId)` and `createOrganizationOwner(organizationId, owner)` (an Owner with a password,
    for tests and the demo);
  - `organizationIds()`: every organization's id, for jobs that visit each one;
  - `inviteListener({ email, appUrl, now? })`: the worker's `identity.send-invite` listener;
  - `disconnect()`.
- Onboarding's steps, each in the caller's transaction (the console runs them in one platform transaction):
  `createOrganizationRecord(tx, { name, code, timeZone, contactEmail })` (the platform role only),
  `insertStarterRoles(tx)`, `inviteOwner(tx, actor, { name, email })` and `requestInvite(tx, actor, memberId)` (inside
  the organization, `asOrganization`). `INVITE_LINK_HOURS` (72), `SEND_INVITE_LISTENER`.
- Permanent deletion's steps, for the platform's jobs (spec 5): `personExport(tx, organizationId, memberId)` and
  `erasePerson(tx, organizationId, memberId)` (a removed person's name, addresses, password, sessions, two-factor
  secret and reset tokens; the membership row stays, so ids still lead somewhere), `organizationUserIds(tx,
organizationId)` and `deleteUsers(tx, userIds)` (a purge's people, with their sessions and memberships).
- `memberActivity(tx, organizationIds)`: seats used and the last sign-in's time per organization, for the platform
  dashboard.
- `IdentityOptions.seatLimit` (a `SeatLimit`): the seats an organization's plan gives. `staff.create` refuses past them
  (`LIMIT_REACHED`, `SEAT_LIMIT_REACHED`), holding the organization's row so two additions can't both take the last.
- `platformStaffRoles` (Better Auth's `user.role` for each level: `admin` for support, `super-admin`) and
  `platformStaffLevelOf(role)`.
- `permissions`, `permissionCatalog`, `isPermission`, `isScopedPermission`, `moduleOf`, `PermissionSet`: the permission
  catalog.
- `assertMayHandleRole`, `assertMayManageMember`, `assertRoleIsEditable`, `permissionSetFromInput`: the no-escalation
  rules (ADR 0005).
- `roleKeyFor(name)`: the key a new role gets.
- `starterRoles`, `OWNER_ROLE_KEY`: the five roles every organization starts with (ADR 0005).
- `scopeFilter(access, permission, ownerField)`, `assertRecordInScope(...)`: request check 5, own or all records.
- `pendingStep(access)`: a password change or two-factor setup still to do.
- `INTERNAL_USERNAME_PATTERN`, `internalUsername`, `placeholderEmail`, `isPlaceholderEmail`, `removedPersonEmail`,
  `shownEmail`: how sign-in names are stored.

## Events

- Publishes `staff.removed` (`{ memberId, userId }`, `staffRemovedEvent` in `@travel-crm/contracts/identity`) when
  someone is removed, in the removal's transaction. Notifications listens (`notifications.forget-push-subscriptions`)
  and forgets the person's browsers.
- Publishes `staff.invited` (`{ memberId, userId }`, `staffInvitedEvent`) when an invite is asked for. Its own
  listener, `identity.send-invite`, emails a link to choose a password: a Better Auth reset token, kept
  only as a hash as Better Auth keeps its own, that lasts 72 hours, at `<APP_URL>/reset-password?token=<token>`, the page Better Auth's
  reset links lead to. Nobody removed, banned or without a real address is emailed.

Every change below is written to the audit log in the change's own transaction (ADR 0015), with the acting member,
the platform admin for onboarding (source `platform`), or the system:

| Action                                    | Record         | Before                 | After                                                |
| ----------------------------------------- | -------------- | ---------------------- | ---------------------------------------------------- |
| `staff.created`                           | `member`       |                        | role, whether they have an email                     |
| `staff.invited`                           | `member`       |                        |                                                      |
| `staff.role-changed`                      | `member`       | role                   | role                                                 |
| `staff.password-reset`                    | `member`       |                        |                                                      |
| `staff.removed`                           | `member`       | role                   |                                                      |
| `role.created`                            | `role`         |                        | name, permissions                                    |
| `role.updated`                            | `role`         | name, permissions      | name, permissions                                    |
| `role.deleted`                            | `role`         | key, name, permissions |                                                      |
| `settings.two-factor-requirement-changed` | `organization` | requireTwoFactor       | requireTwoFactor                                     |
| `support.impersonation-started`           | `member`       |                        | the impersonated user's id, when the session expires |
| `support.impersonation-stopped`           | `member`       |                        | the impersonated user's id, when the session expires |

A change that changes nothing (the same role again, the same setting) records nothing. Support's two entries name
the platform admin as both the actor and `impersonatedBy`; they are written by a Better Auth plugin
(`auth/impersonation-audit.ts`) after the call succeeds.

## Rules worth knowing

- The member table has no row-level security: every query of it filters by `organizationId` itself.
- Nobody grants more than they hold, changes their own access, or touches an Owner unless they are one (`access-rules.ts`).
- Removing someone soft-deletes their membership and releases their email and username (ADR 0007).
- Better Auth's `/admin/*` endpoints are closed over HTTP but for starting and stopping support's impersonation
  (`auth/side-doors.ts`), and support may impersonate only an organization's active staff (ADR 0018).

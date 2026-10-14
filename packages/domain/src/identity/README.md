# identity

Who can sign in, to which organization, and what they may do (spec section 6).

## Public functions and values (`index.ts`)

- `createIdentity(options)` builds the module once per process. The `Identity` it returns has:
  - `auth`: Better Auth (serve `auth.handler`, read sessions with `auth.api.getSession`);
  - `resolveAccess(userId, organizationId, session?)`: the member's role, permissions and pending steps, or null.
    Pass the session's `impersonatedBy`: the access is an `Actor` whose `source` is then `impersonation`;
  - `describeSignedInPerson(session)`: what `me.get` returns;
  - `isPlatformAdmin(user)`;
  - `organizationProfile(organizationId)` and `memberContacts(organizationId, userIds)`: what other modules may know
    about an organization and its people (they can't read the sign-in tables);
  - `staff.list / create / updateRole / resetPassword / remove`;
  - `roles.list / create / update / delete`;
  - `settings.setTwoFactorRequirement`;
  - `seedStarterRoles(organizationId)` and `createOrganizationOwner(organizationId, owner)`, for onboarding;
  - `disconnect()`.
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

No domain events yet. Every change below is written to the audit log in the change's own transaction (ADR 0015),
with the acting member, or the system for onboarding:

| Action                                    | Record         | Before                 | After                               |
| ----------------------------------------- | -------------- | ---------------------- | ----------------------------------- |
| `staff.created`                           | `member`       |                        | name, username, role, whether email |
| `staff.role-changed`                      | `member`       | role                   | role                                |
| `staff.password-reset`                    | `member`       |                        |                                     |
| `staff.removed`                           | `member`       | name, role             |                                     |
| `role.created`                            | `role`         |                        | name, permissions                   |
| `role.updated`                            | `role`         | name, permissions      | name, permissions                   |
| `role.deleted`                            | `role`         | key, name, permissions |                                     |
| `settings.two-factor-requirement-changed` | `organization` | requireTwoFactor       | requireTwoFactor                    |
| `support.impersonation-started`           | `member`       |                        | the impersonated user's id          |
| `support.impersonation-stopped`           | `member`       |                        | the impersonated user's id          |

A change that changes nothing (the same role again, the same setting) records nothing. Support's two entries name
the platform admin as both the actor and `impersonatedBy`; they are written by a Better Auth plugin
(`auth/impersonation-audit.ts`) after the call succeeds.

## Rules worth knowing

- The member table has no row-level security: every query of it filters by `organizationId` itself.
- Nobody grants more than they hold, changes their own access, or touches an Owner unless they are one (`access-rules.ts`).
- Removing someone soft-deletes their membership, releases their email and username, and deletes their browsers' push
  subscriptions (ADR 0007). That table is the notifications module's, but notifications depends on identity, so the
  removal deletes the rows itself, in its own transaction.

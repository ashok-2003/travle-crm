# identity

Who can sign in, to which organization, and what they may do (spec section 6).

## Public functions and values (`index.ts`)

- `createIdentity(options)` builds the module once per process. The `Identity` it returns has:
  - `auth`: Better Auth (serve `auth.handler`, read sessions with `auth.api.getSession`);
  - `resolveAccess(userId, organizationId)`: the member's role, permissions and pending steps, or null;
  - `describeSignedInPerson(session)`: what `me.get` returns;
  - `isPlatformAdmin(user)`;
  - `staff.list / create / updateRole / resetPassword / remove`;
  - `roles.list / create / update / delete`;
  - `settings.setTwoFactorRequirement`;
  - `seedStarterRoles(organizationId)` and `createOrganizationOwner(organizationId, owner)`, for onboarding;
  - `disconnect()`.
- `permissions`, `permissionCatalog`, `isPermission`, `moduleOf`, `PermissionSet`: the permission catalog.
- `starterRoles`, `OWNER_ROLE_KEY`: the five roles every organization starts with (ADR 0005).
- `scopeFilter(access, permission, ownerField)`, `assertRecordInScope(...)`: request check 5, own or all records.
- `pendingStep(access)`: a password change or two-factor setup still to do.
- `internalUsername`, `placeholderEmail`, `isPlaceholderEmail`, `shownEmail`: how sign-in names are stored.

## Events

None yet.

## Rules worth knowing

- The member table has no row-level security: every query of it filters by `organizationId` itself.
- Nobody grants more than they hold, changes their own access, or touches an Owner unless they are one (`access-rules.ts`).
- Removing someone soft-deletes their membership and releases their email and username (ADR 0007).

// Builds the identity module: Better Auth plus the operations the API and onboarding call. One per process.
import type {
  CreateRoleInput,
  CreateStaffInput,
  DeleteRoleInput,
  MeOutput,
  RemoveStaffInput,
  ResetStaffPasswordInput,
  RoleSummary,
  SecuritySettings,
  SetTwoFactorRequirementInput,
  StaffMember,
  UpdateRoleInput,
  UpdateStaffRoleInput,
} from "@travel-crm/contracts/identity";
import { createIdentityDatabase } from "@travel-crm/db/identity";
import {
  describePlatformStaff,
  describeSignedInPerson,
  isPlatformAdmin,
  resolveAccess,
  type AccessSession,
  type PlatformStaffMember,
  type SignedInSession,
} from "./access.js";
import { createAuth, type Auth, type AuthSettings } from "./auth/create-auth.js";
import type { EventListener } from "../jobs/index.js";
import type { MemberAccess } from "./member-access.js";
import {
  memberContacts,
  organizationProfile,
  type MemberContact,
  type OrganizationProfile,
} from "./organization-profile.js";
import { createRole, deleteRole, listRoles, updateRole } from "./roles.js";
import { seedStarterRoles } from "./seed-starter-roles.js";
import { setTwoFactorRequirement } from "./settings.js";
import { createStaffAccount, type CreatedStaff, type PasswordHasher } from "./staff-accounts.js";
import { staffInviteListener, type InviteDependencies } from "./staff-invites.js";
import { createStaff, listStaff, removeStaff, resetStaffPassword, updateStaffRole, type SeatLimit } from "./staff.js";
import { OWNER_ROLE_KEY } from "./starter-roles.js";

export interface IdentityOptions {
  /** DATABASE_URL: must connect as the app_runtime role. */
  databaseUrl: string;
  /** Size of the identity module's connection pool. */
  maxConnections?: number;
  auth: AuthSettings;
  /** The seats each organization's plan gives; adding staff past them is refused. Unset: no limit. */
  seatLimit?: SeatLimit | undefined;
}

/** The first Owner of a new organization. */
export interface NewOwner {
  name: string;
  email: string;
  username?: string | undefined;
  password: string;
  mustChangePassword: boolean;
}

export interface Identity {
  /** Better Auth. The api serves auth.handler at /api/auth/* and reads sessions with auth.api.getSession. */
  readonly auth: Auth;
  /**
   * The user's membership, role and permissions in the organization, or null when they are not an active member.
   * Pass the session's impersonatedBy so actions during support's impersonation are recorded as such.
   */
  resolveAccess(userId: string, organizationId: string, session?: AccessSession): Promise<MemberAccess | null>;
  /** What me.get returns. */
  describeSignedInPerson(session: SignedInSession): Promise<MeOutput | null>;
  /** The organization's name, code, time zone and contact email, for modules that can't read it themselves. */
  organizationProfile(organizationId: string): Promise<OrganizationProfile | null>;
  /** Names and real email addresses of the organization's active members among userIds, for notifications. */
  memberContacts(organizationId: string, userIds: readonly string[]): Promise<MemberContact[]>;
  /** True for platform staff: a platform role (read from the database) and no membership. */
  isPlatformAdmin(user: { id: string; role?: string | null | undefined }): Promise<boolean>;
  /** The person's platform level, name and pending password change, or null for anyone who isn't platform staff. */
  describePlatformStaff(userId: string): Promise<PlatformStaffMember | null>;
  /** The actor's organization's staff. The API checks staff:manage first. */
  readonly staff: {
    list(actor: MemberAccess): Promise<StaffMember[]>;
    create(actor: MemberAccess, input: CreateStaffInput): Promise<StaffMember>;
    updateRole(actor: MemberAccess, input: UpdateStaffRoleInput): Promise<StaffMember>;
    resetPassword(actor: MemberAccess, input: ResetStaffPasswordInput): Promise<void>;
    remove(actor: MemberAccess, input: RemoveStaffInput): Promise<void>;
  };
  /** The actor's organization's roles. Changing them needs roles:manage, which the API checks. */
  readonly roles: {
    list(actor: MemberAccess): Promise<RoleSummary[]>;
    create(actor: MemberAccess, input: CreateRoleInput): Promise<RoleSummary>;
    update(actor: MemberAccess, input: UpdateRoleInput): Promise<RoleSummary>;
    delete(actor: MemberAccess, input: DeleteRoleInput): Promise<void>;
  };
  /** Organization settings owned by identity. Changing them needs settings:manage, which the API checks. */
  readonly settings: {
    setTwoFactorRequirement(actor: MemberAccess, input: SetTwoFactorRequirementInput): Promise<SecuritySettings>;
  };
  /** Every organization's id, oldest first: for jobs that visit each one, such as the subscription lifecycle. */
  organizationIds(): Promise<string[]>;
  /** The worker's listener that emails "staff.invited" invites (identity.send-invite). */
  inviteListener(dependencies: InviteDependencies): EventListener;
  /** Creates the five starter roles. Onboarding calls it once per new organization. */
  seedStarterRoles(organizationId: string): Promise<void>;
  /** Adds an organization's first Owner. Onboarding only: it checks no permissions. */
  createOrganizationOwner(organizationId: string, owner: NewOwner): Promise<CreatedStaff>;
  /** Closes the connection pool. */
  disconnect(): Promise<void>;
}

export function createIdentity(options: IdentityOptions): Identity {
  const database = createIdentityDatabase(options.databaseUrl, { maxConnections: options.maxConnections ?? 10 });
  const auth = createAuth(database, options.auth);
  const hashPassword: PasswordHasher = async (password) => (await auth.$context).password.hash(password);

  return {
    auth,
    resolveAccess: (userId, organizationId, session) => resolveAccess(database, userId, organizationId, session),
    describeSignedInPerson: (session) => describeSignedInPerson(database, session),
    organizationProfile: (organizationId) => organizationProfile(database, organizationId),
    memberContacts: (organizationId, userIds) => memberContacts(database, organizationId, userIds),
    isPlatformAdmin: (user) => isPlatformAdmin(database, user),
    describePlatformStaff: (userId) => describePlatformStaff(database.client, userId),
    staff: {
      list: (actor) => listStaff(database, actor),
      create: (actor, input) => createStaff(database, hashPassword, actor, input, options.seatLimit),
      updateRole: (actor, input) => updateStaffRole(database, actor, input),
      resetPassword: (actor, input) => resetStaffPassword(database, hashPassword, actor, input),
      remove: (actor, input) => removeStaff(database, actor, input),
    },
    roles: {
      list: (actor) => listRoles(database, actor),
      create: (actor, input) => createRole(database, actor, input),
      update: (actor, input) => updateRole(database, actor, input),
      delete: (actor, input) => deleteRole(database, actor, input),
    },
    settings: {
      setTwoFactorRequirement: (actor, input) => setTwoFactorRequirement(database, actor, input),
    },
    organizationIds: async () =>
      (await database.client.organization.findMany({ select: { id: true }, orderBy: { createdAt: "asc" } })).map(
        (organization) => organization.id,
      ),
    inviteListener: (dependencies) => staffInviteListener(database, dependencies),
    seedStarterRoles: (organizationId) => seedStarterRoles(database, organizationId),
    createOrganizationOwner: (organizationId, owner) =>
      createStaffAccount(database, hashPassword, { ...owner, organizationId, roleKey: OWNER_ROLE_KEY }),
    disconnect: () => database.disconnect(),
  };
}

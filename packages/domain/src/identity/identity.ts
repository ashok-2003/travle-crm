// Builds the identity module: Better Auth plus the operations the API and onboarding call. One per process.
import type {
  CreateRoleInput,
  DeleteRoleInput,
  MeOutput,
  RoleSummary,
  UpdateRoleInput,
} from "@travel-crm/contracts/identity";
import { createIdentityDatabase } from "@travel-crm/db/identity";
import { describeSignedInPerson, isPlatformAdmin, resolveAccess, type SignedInSession } from "./access.js";
import { createAuth, type Auth, type AuthSettings } from "./auth/create-auth.js";
import type { MemberAccess } from "./member-access.js";
import { createRole, deleteRole, listRoles, updateRole } from "./roles.js";
import { seedStarterRoles } from "./seed-starter-roles.js";
import { createStaffAccount, type CreatedStaff, type PasswordHasher } from "./staff-accounts.js";
import { OWNER_ROLE_KEY } from "./starter-roles.js";

export interface IdentityOptions {
  /** DATABASE_URL: must connect as the app_runtime role. */
  databaseUrl: string;
  /** Size of the identity module's connection pool. */
  maxConnections?: number;
  auth: AuthSettings;
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
  /** The user's membership, role and permissions in the organization, or null when they are not an active member. */
  resolveAccess(userId: string, organizationId: string): Promise<MemberAccess | null>;
  /** What me.get returns. */
  describeSignedInPerson(session: SignedInSession): Promise<MeOutput | null>;
  /** True for platform staff: user role "admin" (read from the database) and no membership. */
  isPlatformAdmin(user: { id: string; role?: string | null | undefined }): Promise<boolean>;
  /** The actor's organization's roles. Changing them needs roles:manage, which the API checks. */
  readonly roles: {
    list(actor: MemberAccess): Promise<RoleSummary[]>;
    create(actor: MemberAccess, input: CreateRoleInput): Promise<RoleSummary>;
    update(actor: MemberAccess, input: UpdateRoleInput): Promise<RoleSummary>;
    delete(actor: MemberAccess, input: DeleteRoleInput): Promise<void>;
  };
  /** Creates the five starter roles. Onboarding calls it once per new organization. */
  seedStarterRoles(organizationId: string): Promise<void>;
  /** Adds an organization's first Owner. Onboarding only: it checks no permissions. */
  createOrganizationOwner(organizationId: string, owner: NewOwner): Promise<CreatedStaff>;
  /** Closes the connection pool. */
  disconnect(): Promise<void>;
}

export function createIdentity(options: IdentityOptions): Identity {
  const database = createIdentityDatabase(options.databaseUrl, { maxConnections: options.maxConnections ?? 10 });
  const auth = createAuth(database.client, options.auth);
  const hashPassword: PasswordHasher = async (password) => (await auth.$context).password.hash(password);

  return {
    auth,
    resolveAccess: (userId, organizationId) => resolveAccess(database, userId, organizationId),
    describeSignedInPerson: (session) => describeSignedInPerson(database, session),
    isPlatformAdmin: (user) => isPlatformAdmin(database, user),
    roles: {
      list: (actor) => listRoles(database, actor),
      create: (actor, input) => createRole(database, actor, input),
      update: (actor, input) => updateRole(database, actor, input),
      delete: (actor, input) => deleteRole(database, actor, input),
    },
    seedStarterRoles: (organizationId) => seedStarterRoles(database, organizationId),
    createOrganizationOwner: (organizationId, owner) =>
      createStaffAccount(database, hashPassword, { ...owner, organizationId, roleKey: OWNER_ROLE_KEY }),
    disconnect: () => database.disconnect(),
  };
}

// Platform staff as the console shows and manages them (spec 5, 6.1): support, and super admins who also manage plans,
// platform staff and permanent deletion. Only a super admin adds, changes or removes anyone.
import { z } from "zod";
import { emailAddress, personName, recordId } from "../identity/index.js";

export const platformStaffLevel = z.enum(["support", "super-admin"]);
export type PlatformStaffLevel = z.infer<typeof platformStaffLevel>;

/** Who is signed in to the console. */
export const platformWhoAmIOutput = z.object({ userId: recordId, name: z.string(), level: platformStaffLevel });
export type PlatformWhoAmIOutput = z.infer<typeof platformWhoAmIOutput>;

/** One person in the staff list: everyone who is platform staff, and everyone who was and has been removed. */
export const platformStaffEntry = z.object({
  userId: recordId,
  name: z.string(),
  email: z.string(),
  /** Null once removed. */
  level: platformStaffLevel.nullable(),
  /** Set until they replace a temporary password; the console refuses them until then. */
  mustChangePassword: z.boolean(),
  /** Required of platform staff once the console's screens can set it up (plan 5B). */
  twoFactorEnabled: z.boolean(),
  createdAt: z.iso.datetime(),
  removedAt: z.iso.datetime().nullable(),
});
export type PlatformStaffEntry = z.infer<typeof platformStaffEntry>;

/** A newcomer, who signs in by email with a temporary password and must replace it first. */
export const addPlatformStaffInput = z.strictObject({
  name: personName,
  email: emailAddress,
  level: platformStaffLevel,
});
export type AddPlatformStaffInput = z.infer<typeof addPlatformStaffInput>;

/** A temporary password, in this one response only: it is never logged, emailed or stored but as a hash. */
export const temporaryPasswordOutput = z.object({ temporaryPassword: z.string() });
export type TemporaryPasswordOutput = z.infer<typeof temporaryPasswordOutput>;

export const addedPlatformStaff = temporaryPasswordOutput.extend({ userId: recordId });
export type AddedPlatformStaff = z.infer<typeof addedPlatformStaff>;

export const setPlatformStaffLevelInput = z.strictObject({ userId: recordId, level: platformStaffLevel });
export type SetPlatformStaffLevelInput = z.infer<typeof setPlatformStaffLevelInput>;

/** One person of the platform staff, for a removal or a new temporary password. */
export const platformStaffIdInput = z.strictObject({ userId: recordId });
export type PlatformStaffIdInput = z.infer<typeof platformStaffIdInput>;

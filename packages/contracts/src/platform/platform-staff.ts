// Platform staff as the console shows them (spec 5, 6.1): support, and super admins who also manage plans, platform
// staff and permanent deletion.
import { z } from "zod";
import { recordId } from "../identity/index.js";

export const platformStaffLevel = z.enum(["support", "super-admin"]);
export type PlatformStaffLevel = z.infer<typeof platformStaffLevel>;

/** Who is signed in to the console. */
export const platformWhoAmIOutput = z.object({ userId: recordId, name: z.string(), level: platformStaffLevel });
export type PlatformWhoAmIOutput = z.infer<typeof platformWhoAmIOutput>;

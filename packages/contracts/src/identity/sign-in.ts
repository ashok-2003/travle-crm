// Input of the organization-code sign-in route, POST /api/auth/sign-in/org.
import { z } from "zod";
import { organizationCode, passwordAttempt, staffUsername } from "./fields.js";

export const orgSignInInput = z.strictObject({
  orgCode: organizationCode,
  username: staffUsername,
  password: passwordAttempt,
});
export type OrgSignInInput = z.infer<typeof orgSignInInput>;

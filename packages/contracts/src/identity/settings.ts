// Inputs and outputs of the organization settings the identity module owns: requiring two-factor sign-in.
import { z } from "zod";

export const setTwoFactorRequirementInput = z.object({ required: z.boolean() });
export type SetTwoFactorRequirementInput = z.infer<typeof setTwoFactorRequirementInput>;

export const securitySettings = z.object({ requireTwoFactor: z.boolean() });
export type SecuritySettings = z.infer<typeof securitySettings>;

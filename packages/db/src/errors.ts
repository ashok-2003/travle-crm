// Recognising database errors without importing Prisma: other packages may not import @prisma/client.
import { Prisma } from "./generated/prisma/client.js";

/** True when a write failed because a unique value (an email, a username, a role key) is already taken. */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

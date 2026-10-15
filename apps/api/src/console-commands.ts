// The console's one-off commands: their work and what they print, apart from starting the process
// (src/console-command.ts), so the tests run them on the test console's services.
import { parseArgs } from "node:util";
import { emailAddress, personName } from "@travel-crm/contracts/identity";
import { DomainError } from "@travel-crm/domain/kernel";
import { addFirstSuperAdmin, type PlatformServices } from "@travel-crm/domain/platform";

/** The operator's terminal. */
export interface CommandOutput {
  stdout(line: string): void;
  stderr(line: string): void;
}

const FIRST_SUPER_ADMIN_USAGE = "Usage: first-super-admin -- --email <address> --name <name>";

/**
 * `first-super-admin -- --email <address> --name <name>`: makes the first super admin, who signs in by email with the
 * temporary password printed and must replace it first. Refused once any super admin exists; they add everyone else
 * from the console. The password goes to stdout, alone: the one secret our processes print, because the operator's own
 * terminal is where it must go. Everything else goes to stderr. Returns the exit code.
 */
export async function firstSuperAdminCommand(
  platform: PlatformServices,
  args: readonly string[],
  output: CommandOutput,
): Promise<number> {
  const input = firstSuperAdminArguments(args);
  if (input === null) {
    output.stderr(FIRST_SUPER_ADMIN_USAGE);
    return 1;
  }
  try {
    output.stdout((await addFirstSuperAdmin(platform, input)).temporaryPassword);
    return 0;
  } catch (error) {
    // Our own words, ids at most: a super admin exists, or the address is taken or a member's.
    if (!(error instanceof DomainError)) throw error;
    output.stderr(error.message);
    return 1;
  }
}

/** The email (in lower case) and name, checked as the console checks them, or null for anything else. */
function firstSuperAdminArguments(args: readonly string[]): { email: string; name: string } | null {
  let values: { email?: string | undefined; name?: string | undefined };
  try {
    // pnpm hands the script the "--" that ends its own options.
    ({ values } = parseArgs({
      args: args.filter((arg) => arg !== "--"),
      options: { email: { type: "string" }, name: { type: "string" } },
    }));
  } catch {
    return null;
  }
  const email = emailAddress.safeParse(values.email);
  const name = personName.safeParse(values.name);
  return email.success && name.success ? { email: email.data, name: name.data } : null;
}

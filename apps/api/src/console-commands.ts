// The console's one-off commands: their work and what they print, apart from starting the process
// (src/console-command.ts), so the tests run them on the test console's services.
import { parseArgs } from "node:util";
import { emailAddress, personName } from "@travel-crm/contracts/identity";
import { starterRoles } from "@travel-crm/domain/identity";
import { DomainError, isUuid } from "@travel-crm/domain/kernel";
import {
  addFirstSuperAdmin,
  dedupeStoredFiles,
  demoStaff,
  resetDemoOrganization,
  type DemoSettings,
  type PlatformServices,
} from "@travel-crm/domain/platform";

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
    return refused(error, output);
  }
}

/**
 * `demo`: builds the shared demo now, for a fresh local database, rather than at the nightly 02:00 reset: the same
 * reset (resetDemoOrganization), with the console's DEMO_ variables, purging the last demo it built. It prints the
 * organization code and the usernames to sign in with, and never the password: that is DEMO_PASSWORD, already set.
 */
export async function demoCommand(
  platform: PlatformServices,
  demo: DemoSettings | null,
  args: readonly string[],
  output: CommandOutput,
): Promise<number> {
  if (args.some((arg) => arg !== "--")) {
    output.stderr("Usage: demo");
    return 1;
  }
  if (demo === null) {
    output.stderr("Set DEMO_ORGANIZATION_CODE and DEMO_PASSWORD first (see .env.example).");
    return 1;
  }
  try {
    await resetDemoOrganization(platform, demo);
  } catch (error) {
    // The code belongs to an organization no reset built, or a plan for sale took the demo plan's key.
    return refused(error, output);
  }
  const roleName = (key: string) => starterRoles.find((role) => role.key === key)?.name ?? key;
  output.stdout(
    `The demo is ready: sign in with organization code ${demo.code}, the password in DEMO_PASSWORD and one of`,
  );
  output.stdout(`  ${demoStaff.map((staff) => `${staff.username} (${roleName(staff.roleKey)})`).join(", ")}`);
  return 0;
}

const DEDUPE_USAGE = "Usage: dedupe-files -- [--apply] [--organization <id>]";

/**
 * `dedupe-files [--apply] [--organization <id>]`: the one-off clean-up of files stored more than once before a copy
 * shared its holder's bytes (2026-11-25). A dry run by default, which only counts; `--apply` makes the identical files
 * share one object and queues the others' objects, which the console's job deletes once their links have lapsed. It
 * prints organization ids, file counts and bytes, never a file's name. Returns the exit code.
 */
export async function dedupeFilesCommand(
  platform: PlatformServices,
  args: readonly string[],
  output: CommandOutput,
): Promise<number> {
  const options = dedupeArguments(args);
  if (options === null) {
    output.stderr(DEDUPE_USAGE);
    return 1;
  }
  const counts = await dedupeStoredFiles(platform, options);
  const megabytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  const filesWord = (files: number) => (files === 1 ? "1 file" : `${String(files)} files`);
  for (const { organizationId, files, bytes } of counts.filter((count) => count.files > 0)) {
    output.stdout(`${organizationId}: ${filesWord(files)}, ${megabytes(bytes)}`);
  }
  const files = filesWord(counts.reduce((sum, count) => sum + count.files, 0));
  const bytes = megabytes(counts.reduce((sum, count) => sum + count.bytes, 0));
  output.stdout(
    options.apply
      ? `Shared another's stored bytes: ${files}. The console's job deletes the ${bytes} of their own copies.`
      : `Dry run: ${files} can share another's stored bytes, freeing ${bytes}. Add --apply to do it.`,
  );
  return 0;
}

/** `--apply` and an organization's id, or null for anything else. */
function dedupeArguments(args: readonly string[]): { apply: boolean; organizationId?: string } | null {
  let values: { apply?: boolean | undefined; organization?: string | undefined };
  try {
    ({ values } = parseArgs({
      args: args.filter((arg) => arg !== "--"),
      options: { apply: { type: "boolean" }, organization: { type: "string" } },
    }));
  } catch {
    return null;
  }
  const apply = values.apply === true;
  if (values.organization === undefined) return { apply };
  return isUuid(values.organization) ? { apply, organizationId: values.organization } : null;
}

/** A refusal in our own words goes to stderr, with exit code 1; anything else is the command failing. */
function refused(error: unknown, output: CommandOutput): number {
  if (!(error instanceof DomainError)) throw error;
  output.stderr(error.message);
  return 1;
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

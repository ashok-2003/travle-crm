// Runs one of the console's one-off commands once, with the console's environment, then exits with its code:
// `pnpm --filter @travel-crm/api-server run first-super-admin -- --email <address> --name <name>`, `run demo`, or
// `run agent-bench` (the test chats). It starts as the console does (the same variables and checks, the same "console
// start-up failed" message), but serves nothing and runs no jobs. Never over HTTP: only whoever can run the console's image with its environment can run it.
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createPinoLogger, errorFields } from "@travel-crm/integrations/logging";
import { agentBenchCommand } from "./console-agent-bench.js";
import { demoCommand, firstSuperAdminCommand, type CommandOutput } from "./console-commands.js";
import { forgetServiceAccounts } from "./console-environment.js";
import { startConsolePlatform, type ConsolePlatform } from "./console-platform.js";
import type { Services } from "./services.js";
import { startProcess } from "./start-up.js";

type Command = (
  started: ConsolePlatform,
  args: readonly string[],
  output: CommandOutput,
  services: Services,
) => Promise<number>;

const commands: Readonly<Record<string, Command>> = {
  "first-super-admin": ({ platform }, args, output) => firstSuperAdminCommand(platform, args, output),
  demo: ({ platform, settings }, args, output) => demoCommand(platform, settings.demo, args, output),
  // Test chats against a throwaway organization on the local database, with the real model or --fake.
  "agent-bench": ({ platform, settings }, args, output, { ai }) =>
    agentBenchCommand(
      platform,
      {
        ai,
        databaseUrls: [settings.platformDatabaseUrl, process.env.DATABASE_URL ?? ""],
        repositoryRoot: resolve(import.meta.dirname, "../../.."),
        home: join(homedir(), ".config", "travel-crm"),
        now: new Date(),
      },
      args,
      output,
    ),
};

const output: CommandOutput = {
  stdout: (line) => {
    process.stdout.write(`${line}\n`);
  },
  stderr: (line) => {
    process.stderr.write(`${line}\n`);
  },
};

/** Ends the process once what it printed has left: a pipe may still hold it, and exiting would drop it. */
async function exitWhenPrinted(code: number): Promise<never> {
  await Promise.all([process.stdout, process.stderr].map((stream) => new Promise((done) => stream.write("", done))));
  process.exit(code);
}

/** A name that isn't one of the commands: says which there are, and ends the process. */
async function usage(): Promise<never> {
  output.stderr(`Usage: console-command <${Object.keys(commands).join(" | ")}> [arguments]`);
  return exitWhenPrinted(1);
}

// The console never holds the Google service accounts (SC5).
forgetServiceAccounts();

const [name = "", ...args] = process.argv.slice(2);
const command = commands[name] ?? (await usage());

// A command prints its result on stdout, so its log goes to stderr, and only what needs attention.
const { services, logger, running } = await startProcess("console", startConsolePlatform, {
  createLogger: (processName) => createPinoLogger({ process: processName, level: "warn", destination: process.stderr }),
});
let code = 1;
try {
  code = await command(running, args, output, services);
} catch (error) {
  // As the console logs a failure: name, code and frames, never the message, which can quote someone's data.
  logger.error({ command: name, ...errorFields(error) }, "console command failed");
}
try {
  await services.close();
  await running.platform.platformDb.disconnect();
} catch (error) {
  logger.error(errorFields(error), "shutdown failed");
  code = 1;
}
await exitWhenPrinted(code);

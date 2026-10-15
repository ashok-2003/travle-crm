// Runs one of the console's one-off commands once, with the console's environment, then exits with its code:
// `pnpm --filter @travel-crm/api-server run first-super-admin -- --email <address> --name <name>`, or `run demo`. It
// starts as the console does (the same variables and checks, the same "console start-up failed" message), but serves
// nothing and runs no jobs. Never over HTTP: only whoever can run the console's image with its environment can run it.
import { describeError } from "@travel-crm/integrations/jobs";
import { demoCommand, firstSuperAdminCommand, type CommandOutput } from "./console-commands.js";
import { startConsolePlatform, type ConsolePlatform } from "./console-platform.js";
import { startProcess } from "./start-up.js";

type Command = (started: ConsolePlatform, args: readonly string[], output: CommandOutput) => Promise<number>;

const commands: Readonly<Record<string, Command>> = {
  "first-super-admin": ({ platform }, args, output) => firstSuperAdminCommand(platform, args, output),
  demo: ({ platform, settings }, args, output) => demoCommand(platform, settings.demo, args, output),
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

const [name = "", ...args] = process.argv.slice(2);
const command = commands[name] ?? (await usage());

const { services, log, running } = await startProcess("console", startConsolePlatform);
let code = 1;
try {
  code = await command(running, args, output);
} catch (error) {
  // As the console logs a failure: names and codes, never the message, which can quote someone's data.
  log(`${name} failed: ${describeError(error)}`);
}
try {
  await services.close();
  await running.platform.platformDb.disconnect();
} catch (error) {
  log(`shutdown failed: ${describeError(error)}`);
  code = 1;
}
await exitWhenPrinted(code);

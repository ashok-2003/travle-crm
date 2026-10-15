// Runs one of the console's one-off commands once, with the console's environment, then exits with its code:
// `pnpm --filter @travel-crm/api-server run first-super-admin -- --email <address> --name <name>`. It starts as the
// console does (the same variables and checks, the same "console start-up failed" message), but serves nothing and runs
// no jobs. Never over HTTP: only whoever can run the console's image with its environment can run it.
import { describeError } from "@travel-crm/integrations/jobs";
import { firstSuperAdminCommand, type CommandOutput } from "./console-commands.js";
import { startConsolePlatform, type ConsolePlatform } from "./console-platform.js";
import { startProcess } from "./start-up.js";

type Command = (started: ConsolePlatform, args: readonly string[], output: CommandOutput) => Promise<number>;

const commands: Readonly<Record<string, Command>> = {
  "first-super-admin": ({ platform }, args, output) => firstSuperAdminCommand(platform, args, output),
};

const output: CommandOutput = {
  stdout: (line) => {
    process.stdout.write(`${line}\n`);
  },
  stderr: (line) => {
    process.stderr.write(`${line}\n`);
  },
};

const [name = "", ...args] = process.argv.slice(2);
const command = commands[name];
if (command === undefined) {
  output.stderr(`Usage: console-command <${Object.keys(commands).join(" | ")}> [arguments]`);
  process.exit(1);
}

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
// A pipe may still hold what was printed: let it drain before the process ends.
await Promise.all([process.stdout, process.stderr].map((stream) => new Promise((done) => stream.write("", done))));
process.exit(code);

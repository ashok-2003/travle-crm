// A logger for the tests that expect a flow to go quietly: it keeps each warning and error as one line of text, `message
// {fields}`, and drops the routine debug and info lines. A test then ends by checking the list is empty.
import type { LogFields, Logger } from "@travel-crm/integrations/logging";

export function problemLogger(problems: string[], prefix = ""): Logger {
  const keep = (fields: LogFields, message: string) => {
    problems.push(`${prefix}${message} ${JSON.stringify(fields)}`);
  };
  const drop = () => undefined;
  return {
    child: (bindings) => problemLogger(problems, `${prefix}${JSON.stringify(bindings)} `),
    debug: drop,
    info: drop,
    warn: keep,
    error: keep,
  };
}

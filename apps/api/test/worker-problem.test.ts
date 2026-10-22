// What the worker writes for the jobs module's problems: its own ids-only message, with the cause by name, code and
// frames; a message that is not ids only is replaced, not written.
import { createMemoryLogger } from "@travel-crm/integrations/logging";
import { describe, expect, it } from "vitest";
import { logWorkerProblem } from "../src/worker-problem.js";

const organization = "0199e7a1-1234-7890-8123-456789012345";

describe("the worker's problems", () => {
  it("writes the module's message as it is, with the cause's name and code, and an event not found as a warning", () => {
    const logger = createMemoryLogger({ censor: false });
    const log = logWorkerProblem(logger);
    log(
      new Error(`Relaying organization ${organization} failed`, {
        cause: Object.assign(new Error("could not queue for jane.doe@example.com"), { code: "ECONNREFUSED" }),
      }),
    );
    log(new Error(`notifications.deliver: event ${organization} not found in organization ${organization}`));
    expect(logger.entries).toMatchObject([
      {
        level: "error",
        msg: `Relaying organization ${organization} failed`,
        errorName: "Error",
        errorCode: "ECONNREFUSED",
      },
      { level: "warn" },
    ]);
    expect(JSON.stringify(logger.entries)).not.toContain("jane");
  });

  it("replaces a message that is not ids only, and describes anything that is not an Error by its type", () => {
    const logger = createMemoryLogger({ censor: false });
    const log = logWorkerProblem(logger);
    log(new Error("could not reach jane.doe@example.com at +91 98765 43210"));
    log(new Error('quote: "Jane"', { cause: new Error("x") }));
    log("jane.doe@example.com");
    expect(logger.entries.map((entry) => entry.msg)).toEqual([
      "A worker problem",
      "A worker problem",
      "A worker problem",
    ]);
    expect(JSON.stringify(logger.entries)).not.toMatch(/jane|Jane|98765/);
  });
});

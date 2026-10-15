// The api's and the worker's one log: a line each on stderr, ids and codes only. What the jobs module reports is
// printed as written (ids, kept whole), with why it happened as names and codes: never an error's message.
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { processLog, workerProblemLine } from "../src/process-log.js";
import { consoleOutput } from "./support/console-output.js";

describe("the process log", () => {
  it("writes one line to stderr, headed by the process", () => {
    const output = consoleOutput();
    processLog("worker")("queue a.b, job 1 failed: Error");
    processLog("api")("pg-boss error: Error 57P01");
    expect(output()).toEqual(["worker: queue a.b, job 1 failed: Error", "api: pg-boss error: Error 57P01"]);
  });

  it("prints the jobs module's own message with its ids whole, and the cause by name and code", () => {
    const event = randomUUID();
    const organization = "0199e7a1-1234-7890-8123-456789012345";
    const notFound = new Error(`notifications.deliver: event ${event} not found in organization ${organization}`);
    expect(workerProblemLine(notFound)).toBe(
      `notifications.deliver: event ${event} not found in organization ${organization}`,
    );
    const relayed = new Error(`Relaying organization ${organization} failed`, {
      cause: Object.assign(new Error("could not queue for jane.doe@example.com"), {
        code: "ECONNREFUSED",
        cause: new Error("jane.doe@example.com"),
      }),
    });
    expect(workerProblemLine(relayed)).toBe(
      `Relaying organization ${organization} failed: Error ECONNREFUSED, caused by Error`,
    );
  });

  it("describes anything else it is given by name and code alone", () => {
    expect(workerProblemLine("jane.doe@example.com")).toBe("string");
    expect(workerProblemLine({ message: "jane.doe@example.com", code: "E1" })).toBe("Error E1");
  });
});

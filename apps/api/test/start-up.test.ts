// Starting the api or the worker goes through one guard: the environment is read, the services built and started,
// and the process's own start (the worker's listeners and schedules) run inside it. Any failure there is one
// "<process> start-up failed" message, the pools closed, and exit 1.
import { describe, expect, it, vi } from "vitest";
import type { Services } from "../src/services.js";
import { startProcess } from "../src/start-up.js";
import { consoleOutput } from "./support/console-output.js";
import { testEnvironmentVariables } from "./support/environment.js";

class Exited extends Error {
  constructor(readonly code: unknown) {
    super(`exited with ${String(code)}`);
  }
}

/** process.exit, stopped: it throws Exited instead, so the test sees the code. */
function exitStopped() {
  return vi.spyOn(process, "exit").mockImplementation((code) => {
    throw new Exited(code);
  });
}

/** Services that do nothing, so the guard's handling is what is tested. */
function fakeServices() {
  const close = vi.fn(() => Promise.resolve());
  const start = vi.fn(() => Promise.resolve());
  return { services: { start, close } as unknown as Services, start, close };
}

describe("starting a process", () => {
  it("names the process when its environment isn't valid, and exits 1 without printing a value", async () => {
    const exit = exitStopped();
    const output = consoleOutput();
    try {
      await expect(
        startProcess("worker", () => undefined, {
          variables: testEnvironmentVariables({ BETTER_AUTH_SECRET: "short-secret-value" }),
        }),
      ).rejects.toEqual(new Exited(1));
    } finally {
      exit.mockRestore();
    }
    expect(output()[0]).toMatch(/^worker start-up failed EnvironmentError: The environment is not valid:/);
    expect(output().join("\n")).toContain("BETTER_AUTH_SECRET");
    expect(output().join("\n")).not.toContain("short-secret-value");
  });

  it("closes what it built when the process's own start fails, and exits 1", async () => {
    const exit = exitStopped();
    const output = consoleOutput();
    const { services, close } = fakeServices();
    try {
      await expect(
        startProcess(
          "worker",
          () => {
            throw new Error("Queue names must be unique: documents.render-pdf");
          },
          { variables: testEnvironmentVariables(), create: () => services },
        ),
      ).rejects.toEqual(new Exited(1));
    } finally {
      exit.mockRestore();
    }
    expect(close).toHaveBeenCalledOnce();
    expect(output()).toHaveLength(1);
    expect(output()[0]).toMatch(/^worker start-up failed Error: Queue names must be unique/);
  });

  it("gives back the environment, the services, the log and what the process started", async () => {
    const { services, start } = fakeServices();
    const started = await startProcess("api", ({ environment }) => environment.PORT, {
      variables: testEnvironmentVariables({ PORT: "4321" }),
      create: () => services,
    });
    expect(start).toHaveBeenCalledOnce();
    expect(started.services).toBe(services);
    expect(started.running).toBe(4321);
    expect(started.environment.PORT).toBe(4321);
    const output = consoleOutput();
    started.log("a line");
    expect(output()).toEqual(["api: a line"]);
  });
});

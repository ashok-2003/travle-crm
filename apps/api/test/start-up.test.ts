// Starting the api or the worker goes through one guard: the environment is read, the services built and started,
// and the process's own start (the worker's listeners and schedules) run inside it. Any failure there is one
// "<process> start-up failed" message, the pools closed, and exit 1. Once started, an error nothing handled is one
// ids-only line in the process's log, then the process's drain, exiting 1.
import { EventEmitter } from "node:events";
import { createMemoryLogger } from "@travel-crm/integrations/logging";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import type { Services } from "../src/services.js";
import { startProcess, stopOnUnhandledErrors } from "../src/start-up.js";
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
          { variables: testEnvironmentVariables(), create: () => services, createLogger: () => createMemoryLogger() },
        ),
      ).rejects.toEqual(new Exited(1));
    } finally {
      exit.mockRestore();
    }
    expect(close).toHaveBeenCalledOnce();
    expect(output()).toHaveLength(1);
    expect(output()[0]).toMatch(/^worker start-up failed Error: Queue names must be unique/);
  });

  it("gives back the environment, the services and what the process started", async () => {
    const { services, start } = fakeServices();
    const started = await startProcess("api", ({ environment }) => environment.PORT, {
      variables: testEnvironmentVariables({ PORT: "4321" }),
      create: () => services,
      createLogger: () => createMemoryLogger(),
    });
    expect(start).toHaveBeenCalledOnce();
    expect(started.services).toBe(services);
    expect(started.running).toBe(4321);
    expect(started.environment.PORT).toBe(4321);
  });

  it("makes the process's structured log at the environment's level, headed by the process", async () => {
    const { services } = fakeServices();
    const logger = createMemoryLogger();
    const made: unknown[] = [];
    const started = await startProcess("worker", () => undefined, {
      variables: testEnvironmentVariables({ LOG_LEVEL: "warn" }),
      create: () => services,
      createLogger: (processName, environment) => {
        made.push(processName, environment.LOG_LEVEL);
        return logger;
      },
    });
    expect(made).toEqual(["worker", "warn"]);
    expect(started.logger).toBe(logger);
  });

  it("logs, as it starts, its process, version, NODE_ENV and log level", async () => {
    const { services } = fakeServices();
    const logger = createMemoryLogger();
    await startProcess("api", () => undefined, {
      variables: testEnvironmentVariables({ LOG_LEVEL: "info", GIT_SHA: "0123456789abcdef0123" }),
      create: () => services,
      createLogger: () => logger,
    });
    expect(logger.entries).toMatchObject([
      { level: "info", msg: "api starting", version: "0123456789ab", nodeEnv: "test", logLevel: "info" },
    ]);
  });
});

describe("an error nothing handled", () => {
  it("is one line by name, code and frames, then the process's drain, exiting 1, once", () => {
    const events = new EventEmitter();
    const logger = createMemoryLogger();
    const drain = vi.fn();
    stopOnUnhandledErrors(logger, drain, { events, exit: vi.fn() });
    events.emit("unhandledRejection", new Error("asha@example.test could not be reached"), Promise.resolve());
    expect(logger.entries).toMatchObject([{ level: "error", msg: "unhandled rejection", errorName: "Error" }]);
    expect(drain).toHaveBeenCalledExactlyOnceWith(1);
    // Another while draining is logged too, and drains nothing more.
    events.emit("uncaughtException", new TypeError("reset link https://example.test/r/secret"), "uncaughtException");
    expect(logger.entries.map((entry) => [entry.msg, entry.errorName])).toEqual([
      ["unhandled rejection", "Error"],
      ["uncaught exception", "TypeError"],
    ]);
    expect(JSON.stringify(logger.entries)).not.toMatch(/asha|secret/);
    expect(drain).toHaveBeenCalledOnce();
  });

  it("doesn't loop when the logger itself fails: the error raised while logging is not logged again", () => {
    const events = new EventEmitter();
    const drain = vi.fn();
    let calls = 0;
    const logger = {
      ...createMemoryLogger(),
      error: () => {
        calls += 1;
        // The failing log call raises an unhandled error of its own, as a dead transport did.
        events.emit("uncaughtException", new Error("the logger's stream is dead"), "uncaughtException");
        throw new Error("the logger's stream is dead");
      },
    };
    stopOnUnhandledErrors(logger, drain, { events, exit: vi.fn() });
    events.emit("unhandledRejection", new Error("first"), Promise.resolve());
    expect(calls).toBe(1);
    expect(drain).toHaveBeenCalledOnce();
  });

  it("exits 1 after 45 seconds if the drain hangs, with a timer that holds nothing open", () => {
    vi.useFakeTimers();
    onTestFinished(() => {
      vi.useRealTimers();
    });
    const events = new EventEmitter();
    const logger = createMemoryLogger();
    const exit = vi.fn();
    const timers = vi.spyOn(globalThis, "setTimeout");
    // A drain that never finishes: a stuck pool, a keep-alive the server won't close.
    stopOnUnhandledErrors(logger, vi.fn(), { events, exit });
    events.emit("uncaughtException", new Error("stuck"), "uncaughtException");
    const deadline = timers.mock.results[0]?.value as NodeJS.Timeout | undefined;
    expect(deadline?.hasRef()).toBe(false);
    vi.advanceTimersByTime(44_999);
    expect(exit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(logger.entries.map((entry) => entry.msg)).toEqual([
      "uncaught exception",
      "the drain took too long: exiting",
    ]);
  });
});

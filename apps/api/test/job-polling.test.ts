// JOBS_POLLING_SECONDS sets how often the worker looks for work, to spare a metered network or a database that sleeps
// when idle (docs/runbook.md, "Working hours and night bursts"): each queue's poll, pg-boss's scheduled sends (at most
// 45 s, pg-boss's limit) and the outbox relay's idle wait, and with it pg-boss's own housekeeping slowed to what still
// does its job, and a longer wait for running jobs when the process stops. Unset, every process keeps pg-boss's and the
// relay's own timings. Whatever it says, the api only sends jobs, so its pg-boss runs none of its own loops and an idle
// api asks the database nothing; so does the console with CONSOLE_JOBS off, which serves its pages and runs no jobs.
import { describe, expect, it } from "vitest";
import { loadEnvironment } from "../src/environment.js";
import { consoleRunsJobs, jobQueuePollingOf, jobQueueRoleOf, relayPollingOf } from "../src/job-polling.js";
import { testEnvironmentVariables } from "./support/environment.js";

const environmentWith = (value: string) => loadEnvironment(testEnvironmentVariables({ JOBS_POLLING_SECONDS: value }));

/** pg-boss's housekeeping on a quiet host: what JOBS_POLLING_SECONDS brings beside the polls themselves. */
const quietHousekeeping = {
  flowIntervalSeconds: 3600,
  superviseIntervalSeconds: 300,
  monitorIntervalSeconds: 300,
  queueCacheIntervalSeconds: 600,
  cronMonitorIntervalSeconds: 45,
  stopTimeoutSeconds: 120,
};

describe("JOBS_POLLING_SECONDS", () => {
  it("is unset by default and when blank, leaving pg-boss's and the relay's own timings", () => {
    for (const environment of [loadEnvironment(testEnvironmentVariables()), environmentWith("")]) {
      expect(environment.JOBS_POLLING_SECONDS).toBeUndefined();
      expect(jobQueuePollingOf(environment)).toEqual({});
      expect(relayPollingOf(environment)).toEqual({});
    }
  });

  it("sets each queue's poll and the relay's idle wait, and the scheduled sends' as far as pg-boss allows", () => {
    const everyTwoMinutes = environmentWith("120");
    expect(everyTwoMinutes.JOBS_POLLING_SECONDS).toBe(120);
    expect(jobQueuePollingOf(everyTwoMinutes)).toEqual({
      pollingIntervalSeconds: 120,
      cronWorkerIntervalSeconds: 45,
      ...quietHousekeeping,
    });
    expect(relayPollingOf(everyTwoMinutes)).toEqual({ relay: { intervalMs: 120_000 } });
    expect(jobQueuePollingOf(environmentWith("10"))).toEqual({
      pollingIntervalSeconds: 10,
      cronWorkerIntervalSeconds: 10,
      ...quietHousekeeping,
    });
  });

  it("slows pg-boss's housekeeping to what still does its job, and lets running jobs finish for 2 minutes", () => {
    // Flows (jobs that wait on other jobs) are never used here, so their check runs hourly; expired jobs, queue
    // statistics and the list of queues every 5 to 10 minutes; the schedules' watchdog as seldom as pg-boss allows.
    // The working hours stop the worker every day.
    expect(jobQueuePollingOf(environmentWith("120"))).toMatchObject(quietHousekeeping);
  });

  it("is allowed in production", () => {
    const production = testEnvironmentVariables({
      NODE_ENV: "production",
      BETTER_AUTH_URL: "https://app.example.in",
      APP_URL: "https://app.example.in",
      BETTER_AUTH_SECRET: "wB7qk2Rz9XvLm4TnY8cPa5HdJ3sFe6Ug",
      VAPID_PUBLIC_KEY: "BNDwagd-different-public-key-for-production-0123456789abcdefghijklmnopqrstuvwxyz",
      JOBS_POLLING_SECONDS: "120",
    });
    expect(loadEnvironment(production).JOBS_POLLING_SECONDS).toBe(120);
  });

  it("refuses anything but whole seconds from 1 to 600, naming the variable", () => {
    for (const value of ["0", "601", "1.5", "two minutes"]) {
      expect(() => environmentWith(value), value).toThrow(/JOBS_POLLING_SECONDS/);
    }
  });
});

describe("CONSOLE_JOBS", () => {
  const consoleJobs = (value?: string) =>
    loadEnvironment(testEnvironmentVariables(value === undefined ? {} : { CONSOLE_JOBS: value }));

  it("is on by default: the console runs its jobs", () => {
    expect(consoleJobs().CONSOLE_JOBS).toBe(true);
    expect(consoleRunsJobs(consoleJobs())).toBe(true);
  });

  it("reads on and off, as the working hours write it, and true and false", () => {
    expect(consoleRunsJobs(consoleJobs("on"))).toBe(true);
    expect(consoleRunsJobs(consoleJobs("true"))).toBe(true);
    expect(consoleRunsJobs(consoleJobs("off"))).toBe(false);
    expect(consoleRunsJobs(consoleJobs("false"))).toBe(false);
  });

  it("refuses anything else, naming the variable", () => {
    expect(() => consoleJobs("sometimes")).toThrow(/CONSOLE_JOBS/);
  });
});

describe("each process's job queue", () => {
  const on = loadEnvironment(testEnvironmentVariables());
  const off = loadEnvironment(testEnvironmentVariables({ CONSOLE_JOBS: "off" }));

  it("only sends from the api, which supervises nothing and keeps no schedules; the worker and the console work", () => {
    expect(jobQueueRoleOf("api", on)).toEqual({ sendOnly: true });
    expect(jobQueueRoleOf("worker", on)).toEqual({});
    expect(jobQueueRoleOf("console", on)).toEqual({});
  });

  it("only sends from the console with its jobs off, which then asks the database nothing while idle", () => {
    expect(jobQueueRoleOf("console", off)).toEqual({ sendOnly: true });
    // The switch is the console's alone.
    expect(jobQueueRoleOf("worker", off)).toEqual({});
    expect(jobQueueRoleOf("api", off)).toEqual({ sendOnly: true });
  });
});

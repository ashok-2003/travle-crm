// JOBS_POLLING_SECONDS sets how often the worker looks for work, to spare a metered network (docs/serverless.md): each
// queue's poll, pg-boss's scheduled sends (at most 45 s, pg-boss's limit) and the outbox relay's idle wait. Unset, every
// process keeps pg-boss's and the relay's own timings. Whatever it says, the api only sends jobs, so its pg-boss runs none
// of its own loops and an idle api asks the database nothing.
import { describe, expect, it } from "vitest";
import { loadEnvironment } from "../src/environment.js";
import { jobQueuePollingOf, jobQueueRoleOf, relayPollingOf } from "../src/job-polling.js";
import { testEnvironmentVariables } from "./support/environment.js";

const environmentWith = (value: string) => loadEnvironment(testEnvironmentVariables({ JOBS_POLLING_SECONDS: value }));

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
    expect(jobQueuePollingOf(everyTwoMinutes)).toEqual({ pollingIntervalSeconds: 120, cronWorkerIntervalSeconds: 45 });
    expect(relayPollingOf(everyTwoMinutes)).toEqual({ relay: { intervalMs: 120_000 } });
    expect(jobQueuePollingOf(environmentWith("10"))).toEqual({
      pollingIntervalSeconds: 10,
      cronWorkerIntervalSeconds: 10,
    });
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

describe("each process's job queue", () => {
  it("only sends from the api, which supervises nothing and keeps no schedules; the worker and the console work", () => {
    expect(jobQueueRoleOf("api")).toEqual({ sendOnly: true });
    expect(jobQueueRoleOf("worker")).toEqual({});
    expect(jobQueueRoleOf("console")).toEqual({});
  });
});

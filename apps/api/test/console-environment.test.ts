// The console process refuses to start without the platform role's own connection, or with a half-set demo, and
// says which variable is wrong. The api's own variables are read by the start-up guard, as for every process.
import { describe, expect, it } from "vitest";
import { loadConsoleSettings } from "../src/console-environment.js";

const environment = { DATABASE_URL: "postgresql://app_runtime:runtime@localhost:55432/travel_crm" };
const platform = { DATABASE_PLATFORM_URL: "postgresql://app_platform:platform@localhost:55432/travel_crm" };
const demo = { DEMO_ORGANIZATION_CODE: "demo", DEMO_PLAN_KEY: "growth", DEMO_PASSWORD: "demo-password-123" };

/** The variables without the one named. */
const without = (variables: Record<string, string>, name: string) =>
  Object.fromEntries(Object.entries(variables).filter(([key]) => key !== name));

describe("the console's settings", () => {
  it("reads the platform role's connection and port, and no demo unless one is set", () => {
    expect(loadConsoleSettings(platform, environment)).toEqual({
      platformDatabaseUrl: platform.DATABASE_PLATFORM_URL,
      port: 3002,
      demo: null,
    });
    expect(loadConsoleSettings({ ...platform, ...demo, CONSOLE_PORT: "4002" }, environment)).toEqual({
      platformDatabaseUrl: platform.DATABASE_PLATFORM_URL,
      port: 4002,
      demo: { code: "DEMO", planKey: "growth", password: "demo-password-123" },
    });
  });

  it("refuses to start without its own connection, or with the api's in its place", () => {
    expect(() => loadConsoleSettings({}, environment)).toThrow(/DATABASE_PLATFORM_URL/);
    expect(() => loadConsoleSettings({ DATABASE_PLATFORM_URL: environment.DATABASE_URL }, environment)).toThrow(
      /DATABASE_PLATFORM_URL: must connect as the platform role, not DATABASE_URL's/,
    );
  });

  it("takes the demo whole or not at all, and never with a short password", () => {
    expect(() => loadConsoleSettings({ ...platform, ...without(demo, "DEMO_PASSWORD") }, environment)).toThrow(
      /DEMO_PASSWORD: is needed with DEMO_ORGANIZATION_CODE, DEMO_PLAN_KEY/,
    );
    expect(() => loadConsoleSettings({ ...platform, ...demo, DEMO_PASSWORD: "short" }, environment)).toThrow(
      /DEMO_PASSWORD/,
    );
    expect(() =>
      loadConsoleSettings({ ...platform, ...demo, DEMO_ORGANIZATION_CODE: "no spaces" }, environment),
    ).toThrow(/DEMO_ORGANIZATION_CODE/);
  });
});

// The console process refuses to start without the platform role's own connection, or with a half-set demo, and
// says which variable is wrong. The api's own variables are read by the start-up guard, as for every process.
import { describe, expect, it } from "vitest";
import { forgetServiceAccounts, loadConsoleSettings } from "../src/console-environment.js";

const environment = {
  DATABASE_URL: "postgresql://app_runtime:runtime@localhost:55432/travel_crm",
  NODE_ENV: "test" as "development" | "test" | "production",
};
const platform = { DATABASE_PLATFORM_URL: "postgresql://app_platform:platform@localhost:55432/travel_crm" };
const demo = { DEMO_ORGANIZATION_CODE: "demo", DEMO_PASSWORD: "demo-password-123" };

/** The variables without the one named. */
const without = (variables: Record<string, string>, name: string) =>
  Object.fromEntries(Object.entries(variables).filter(([key]) => key !== name));

describe("the console's settings", () => {
  it("reads the platform role's connection and port, and no demo unless one is set", () => {
    expect(loadConsoleSettings(platform, environment)).toEqual({
      platformDatabaseUrl: platform.DATABASE_PLATFORM_URL,
      port: 3002,
      demo: null,
      sheetsHashKey: null,
    });
    expect(loadConsoleSettings({ ...platform, ...demo, CONSOLE_PORT: "4002" }, environment)).toEqual({
      platformDatabaseUrl: platform.DATABASE_PLATFORM_URL,
      port: 4002,
      demo: { code: "DEMO", password: "demo-password-123" },
      sheetsHashKey: null,
    });
  });

  it("lets the console read SHEETS_HASH_KEY, and never the service accounts", () => {
    const key = "k".repeat(40);
    expect(loadConsoleSettings({ ...platform, SHEETS_HASH_KEY: key }, environment).sheetsHashKey).toBe(key);
    expect(loadConsoleSettings({ ...platform, SHEETS_HASH_KEY: "" }, environment).sheetsHashKey).toBeNull();
    expect(() => loadConsoleSettings({ ...platform, SHEETS_HASH_KEY: "short" }, environment)).toThrow(
      /SHEETS_HASH_KEY: must be at least 32 characters/,
    );
    // Its settings have no field for the accounts, whatever the process was given.
    const settings = loadConsoleSettings(
      { ...platform, SHEETS_HASH_KEY: key, GOOGLE_SHEETS_SERVICE_ACCOUNTS: "secret-key-text" },
      environment,
    );
    expect(JSON.stringify(settings)).not.toContain("secret-key-text");
  });

  it("holds SHEETS_HASH_KEY to the production strength check, naming the variable (SC8)", () => {
    const production = { ...environment, NODE_ENV: "production" as const };
    expect(() => loadConsoleSettings({ ...platform, SHEETS_HASH_KEY: "k".repeat(40) }, production)).toThrow(
      /SHEETS_HASH_KEY: is too weak for production/,
    );
    const strong = "rQ7vK2mXz9LpT4wNb8Ys5HdJ3cFe6UgA";
    expect(loadConsoleSettings({ ...platform, SHEETS_HASH_KEY: strong }, production).sheetsHashKey).toBe(strong);
  });

  it("takes the service accounts out of the variables the console reads (SC5)", () => {
    const variables = { A: "1", GOOGLE_SHEETS_SERVICE_ACCOUNTS: "secret-key-text" };
    expect(forgetServiceAccounts(variables)).toEqual({ A: "1" });
    expect("GOOGLE_SHEETS_SERVICE_ACCOUNTS" in variables).toBe(false);
  });

  it("refuses to start without its own connection, or with the api's in its place", () => {
    expect(() => loadConsoleSettings({}, environment)).toThrow(/DATABASE_PLATFORM_URL/);
    expect(() => loadConsoleSettings({ DATABASE_PLATFORM_URL: environment.DATABASE_URL }, environment)).toThrow(
      /DATABASE_PLATFORM_URL: must connect as the platform role, not DATABASE_URL's/,
    );
  });

  it("takes the demo whole or not at all, and never with a short password", () => {
    expect(() => loadConsoleSettings({ ...platform, ...without(demo, "DEMO_PASSWORD") }, environment)).toThrow(
      /DEMO_PASSWORD: is needed with DEMO_ORGANIZATION_CODE/,
    );
    expect(() => loadConsoleSettings({ ...platform, ...demo, DEMO_PASSWORD: "demo123" }, environment)).toThrow(
      /DEMO_PASSWORD: must be at least 8 characters/,
    );
    // The owner's choice (2026-10-19): eight characters, easy to hand a prospect; the demo is walled off by row-level
    // security like any organization.
    expect(loadConsoleSettings({ ...platform, ...demo, DEMO_PASSWORD: "demo1234" }, environment).demo?.password).toBe(
      "demo1234",
    );
    expect(() =>
      loadConsoleSettings({ ...platform, ...demo, DEMO_ORGANIZATION_CODE: "no spaces" }, environment),
    ).toThrow(/DEMO_ORGANIZATION_CODE/);
  });
});

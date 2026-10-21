// GOOGLE_SHEETS_SERVICE_ACCOUNTS is read as one key file or a list, as single-line JSON or base64, and a bad value is
// refused naming the variable and never printing any of it.
import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { loadEnvironment } from "../src/environment.js";
import {
  decodeServiceAccounts,
  sheetsHashKeyCheckValue,
  sheetsHashKeyIsWeak,
  sheetsStartUpLine,
} from "../src/sheets-settings.js";
import { testEnvironmentVariables } from "./support/environment.js";

/** A key for this run only, as a key file holds it: PEM text with real newlines. */
const throwawayPem = () =>
  generateKeyPairSync("ec", { namedCurve: "P-256" }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const first = {
  type: "service_account",
  client_email: "crm-one@project.iam.gserviceaccount.com",
  private_key: throwawayPem(),
};
const second = { client_email: "crm-two@project.iam.gserviceaccount.com", private_key: throwawayPem() };
const base64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64");
const expected = (...keys: { client_email: string; private_key: string }[]) =>
  keys.map((key) => ({ client_email: key.client_email, private_key: key.private_key }));
const hashKey = "k".repeat(40);

describe("decodeServiceAccounts", () => {
  it("reads a key file as base64, as single-line JSON, and a list of several as either", () => {
    expect(decodeServiceAccounts(JSON.stringify(first))).toEqual(expected(first));
    expect(decodeServiceAccounts(base64(first))).toEqual(expected(first));
    expect(decodeServiceAccounts(JSON.stringify([first, second]))).toEqual(expected(first, second));
    expect(decodeServiceAccounts(base64([first, second]))).toEqual(expected(first, second));
    expect(decodeServiceAccounts(`  ${base64(first)}\n`)).toEqual(expected(first));
  });

  it("refuses a value that is neither, or lacks client_email or private_key", () => {
    for (const bad of [
      "",
      "not json and not base64!",
      "abcd",
      JSON.stringify({ client_email: "a@b.c" }),
      JSON.stringify({ private_key: first.private_key }),
      JSON.stringify({ client_email: "not an email", private_key: first.private_key }),
      JSON.stringify([]),
      JSON.stringify([first, { client_email: "x@y.z" }]),
      base64("just a string"),
      base64(42),
    ]) {
      expect(decodeServiceAccounts(bad), bad).toBeNull();
    }
  });

  it("refuses a private key that cannot be parsed, such as one pasted with escaped newlines (SC4)", () => {
    const escaped = first.private_key.replaceAll("\n", "\\n");
    for (const bad of [
      { ...first, private_key: escaped },
      { ...first, private_key: "-----BEGIN PRIVATE KEY-----\nnot-a-key\n-----END PRIVATE KEY-----\n" },
      { ...first, private_key: "PEM" },
      [first, { ...second, private_key: escaped }],
    ]) {
      expect(decodeServiceAccounts(JSON.stringify(bad)), JSON.stringify(bad).slice(0, 40)).toBeNull();
    }
  });
});

describe("the environment's Google Sheets settings", () => {
  it("names GOOGLE_SHEETS_SERVICE_ACCOUNTS for an unparseable key and never prints the key (SC4)", () => {
    const value = JSON.stringify({ ...first, private_key: first.private_key.replaceAll("\n", "\\n") });
    let message = "";
    try {
      loadEnvironment(testEnvironmentVariables({ GOOGLE_SHEETS_SERVICE_ACCOUNTS: value }));
    } catch (error) {
      message = String(error);
    }
    expect(message).toMatch(/GOOGLE_SHEETS_SERVICE_ACCOUNTS/);
    expect(message).not.toContain("BEGIN PRIVATE KEY");
    expect(message).not.toContain(first.client_email);
  });

  it("refuses a value that is not a key, naming the variable and never printing the value", () => {
    const attempt = () =>
      loadEnvironment(testEnvironmentVariables({ GOOGLE_SHEETS_SERVICE_ACCOUNTS: "nope-secret-text" }));
    expect(attempt).toThrow(/GOOGLE_SHEETS_SERVICE_ACCOUNTS/);
    expect(attempt).not.toThrow(/nope-secret-text/);
  });

  it("needs SHEETS_HASH_KEY of 32 characters when the accounts are set, and not otherwise", () => {
    const accounts = { GOOGLE_SHEETS_SERVICE_ACCOUNTS: base64(first) };
    expect(() => loadEnvironment(testEnvironmentVariables(accounts))).toThrow(/SHEETS_HASH_KEY: is needed/);
    expect(() => loadEnvironment(testEnvironmentVariables({ ...accounts, SHEETS_HASH_KEY: "short" }))).toThrow(
      /SHEETS_HASH_KEY: must be at least 32 characters/,
    );
    const environment = loadEnvironment(testEnvironmentVariables({ ...accounts, SHEETS_HASH_KEY: hashKey }));
    expect(environment.GOOGLE_SHEETS_SERVICE_ACCOUNTS).toEqual(expected(first));
    expect(environment.SHEETS_HASH_KEY).toBe(hashKey);
    // Neither set: Google Sheets is off. A key alone is allowed (the console takes it).
    expect(loadEnvironment(testEnvironmentVariables()).GOOGLE_SHEETS_SERVICE_ACCOUNTS).toBeUndefined();
    expect(loadEnvironment(testEnvironmentVariables({ SHEETS_HASH_KEY: hashKey })).SHEETS_HASH_KEY).toBe(hashKey);
  });

  it("reads a blank value, as a compose file passes it through, as unset", () => {
    const environment = loadEnvironment(
      testEnvironmentVariables({
        GOOGLE_SHEETS_SERVICE_ACCOUNTS: "",
        SHEETS_HASH_KEY: "",
        GOOGLE_SHEETS_TEST_SERVER_URL: "",
        SHEETS_CHECK_INTERVAL_SECONDS: "",
      }),
    );
    expect(environment.GOOGLE_SHEETS_SERVICE_ACCOUNTS).toBeUndefined();
    expect(environment.SHEETS_HASH_KEY).toBeUndefined();
    expect(environment.GOOGLE_SHEETS_TEST_SERVER_URL).toBeUndefined();
    expect(environment.SHEETS_CHECK_INTERVAL_SECONDS).toBeUndefined();
  });

  it("refuses the test server URL and the interval in production", () => {
    const production = {
      NODE_ENV: "production",
      BETTER_AUTH_URL: "https://app.example.in",
      APP_URL: "https://app.example.in",
      BETTER_AUTH_SECRET: "wB7qk2Rz9XvLm4TnY8cPa5HdJ3sFe6Ug",
      VAPID_PUBLIC_KEY: "BNDwagd-different-public-key-for-production-0123456789abcdefghijklmnopqrstuvwxyz",
    };
    expect(() =>
      loadEnvironment(
        testEnvironmentVariables({ ...production, GOOGLE_SHEETS_TEST_SERVER_URL: "http://127.0.0.1:4010" }),
      ),
    ).toThrow(/GOOGLE_SHEETS_TEST_SERVER_URL: is for development and tests only/);
    expect(() =>
      loadEnvironment(testEnvironmentVariables({ ...production, SHEETS_CHECK_INTERVAL_SECONDS: "1" })),
    ).toThrow(/SHEETS_CHECK_INTERVAL_SECONDS: is for development and tests only/);
    const development = loadEnvironment(
      testEnvironmentVariables({
        GOOGLE_SHEETS_TEST_SERVER_URL: "http://127.0.0.1:4010",
        SHEETS_CHECK_INTERVAL_SECONDS: "1",
      }),
    );
    expect(development).toMatchObject({
      GOOGLE_SHEETS_TEST_SERVER_URL: "http://127.0.0.1:4010",
      SHEETS_CHECK_INTERVAL_SECONDS: 1,
    });
  });

  it("holds SHEETS_HASH_KEY to a strength check in production, as BETTER_AUTH_SECRET is (SC8)", () => {
    const production = {
      NODE_ENV: "production",
      BETTER_AUTH_URL: "https://app.example.in",
      APP_URL: "https://app.example.in",
      BETTER_AUTH_SECRET: "wB7qk2Rz9XvLm4TnY8cPa5HdJ3sFe6Ug",
      VAPID_PUBLIC_KEY: "BNDwagd-different-public-key-for-production-0123456789abcdefghijklmnopqrstuvwxyz",
      GOOGLE_SHEETS_SERVICE_ACCOUNTS: base64(first),
    };
    expect(() => loadEnvironment(testEnvironmentVariables({ ...production, SHEETS_HASH_KEY: hashKey }))).toThrow(
      /SHEETS_HASH_KEY: is too weak for production/,
    );
    const strong = "rQ7vK2mXz9LpT4wNb8Ys5HdJ3cFe6UgA";
    expect(loadEnvironment(testEnvironmentVariables({ ...production, SHEETS_HASH_KEY: strong })).SHEETS_HASH_KEY).toBe(
      strong,
    );
    // The key alone, without the accounts (the console's), is checked too.
    const keyOnly = Object.fromEntries(
      Object.entries(production).filter(([name]) => name !== "GOOGLE_SHEETS_SERVICE_ACCOUNTS"),
    );
    expect(() => loadEnvironment(testEnvironmentVariables({ ...keyOnly, SHEETS_HASH_KEY: hashKey }))).toThrow(
      /SHEETS_HASH_KEY: is too weak for production/,
    );
  });

  it("calls a key weak when it has fewer than 10 distinct characters or is the .env.example's", () => {
    expect(sheetsHashKeyIsWeak("k".repeat(40))).toBe(true);
    expect(sheetsHashKeyIsWeak("abcdefghi".repeat(5))).toBe(true);
    expect(sheetsHashKeyIsWeak("rQ7vK2mXz9LpT4wNb8Ys5HdJ3cFe6UgA")).toBe(false);
  });

  it("derives a check value from the key that every process computes alike and that does not reveal it", () => {
    const one = sheetsHashKeyCheckValue("rQ7vK2mXz9LpT4wNb8Ys5HdJ3cFe6UgA");
    expect(one).toEqual(sheetsHashKeyCheckValue("rQ7vK2mXz9LpT4wNb8Ys5HdJ3cFe6UgA"));
    expect(one).not.toEqual(sheetsHashKeyCheckValue("rQ7vK2mXz9LpT4wNb8Ys5HdJ3cFe6UgB"));
    expect(one.length).toBe(32);
  });

  it("says how many accounts were read, and nothing of them", () => {
    expect(sheetsStartUpLine(0)).toBe("Google Sheets: not set up");
    expect(sheetsStartUpLine(1)).toBe("Google Sheets: 1 service account");
    expect(sheetsStartUpLine(2)).toBe("Google Sheets: 2 service accounts");
  });
});

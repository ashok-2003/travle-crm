// What the api runs on is built from the environment: start() refuses to go on when the database role is wrong or
// the storage bucket can't be used, before pg-boss starts; the rate limiter's key is derived from the auth secret rather than set apart; the
// password-reset email goes out through the SMTP sender to APP_URL's reset page; pg-boss's problems go to the
// process's one log as ids and codes, with nothing else on the console; and each organization is held to its plan's
// seats and storage.
import { WrongDatabaseRoleError } from "@travel-crm/db";
import { createPlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { describe, expect, inject, it } from "vitest";
import { processLog } from "../src/process-log.js";
import { createServices, rateLimitKeySecret } from "../src/services.js";
import { consoleOutput } from "./support/console-output.js";
import { testEnvironment as environment, testSecret as secret } from "./support/environment.js";
import { eventually } from "./support/eventually.js";
import { startMailpit } from "./support/mailpit.js";

describe("services", () => {
  it("refuses to start when the storage bucket can't be reached", async () => {
    const services = createServices(environment(), processLog("api"));
    try {
      await expect(services.start()).rejects.toThrow(`The storage bucket "travel-crm" can't be used: unreachable`);
    } finally {
      await services.close();
    }
  });

  it("refuses to start when DATABASE_URL isn't the app_runtime role, before it tries the bucket or pg-boss", async () => {
    const services = createServices(environment({ DATABASE_URL: inject("dbUrls").migrator }), processLog("api"));
    try {
      await expect(services.start()).rejects.toThrow(WrongDatabaseRoleError);
    } finally {
      await services.close();
    }
  });

  it("sends password-reset emails through the SMTP sender, back to APP_URL's reset page and nowhere else", async () => {
    const mailpit = await startMailpit();
    const services = createServices(
      environment({
        SMTP_HOST: mailpit.smtpHost,
        SMTP_PORT: String(mailpit.smtpPort),
        APP_URL: "http://localhost:3000",
        // One request from no forwarded address: Better Auth's own limit isn't what this checks.
        AUTH_RATE_LIMIT: "false",
      }),
      processLog("api"),
    );
    const platform = createPlatformClient(inject("dbUrls").platform);
    try {
      const organizationId = await createTestOrganization(platform, "Services agency");
      await services.identity.seedStarterRoles(organizationId);
      const email = `owner-${organizationId}@example.test`;
      await services.identity.createOrganizationOwner(organizationId, {
        name: "Asha Owner",
        email,
        password: "owner-password-1",
        mustChangePassword: false,
      });
      const ask = (redirectTo: string) =>
        services.identity.auth.handler(
          new Request("http://localhost:3001/api/auth/request-password-reset", {
            method: "POST",
            headers: { "content-type": "application/json", origin: "http://localhost:3000" },
            body: JSON.stringify({ email, redirectTo }),
          }),
        );
      expect((await ask("http://localhost:3000/sign-in")).status).toBe(403);
      expect((await ask("http://localhost:3000/reset-password")).status).toBe(200);
      const [message] = await mailpit.messagesOnceThereAre(1);
      expect(message).toMatchObject({
        From: { Address: "no-reply@travel-crm.localhost" },
        To: [{ Address: email }],
        Subject: "Reset your password",
      });
      expect(message?.Text).toContain("callbackURL=http%3A%2F%2Flocalhost%3A3000%2Freset-password");
    } finally {
      await services.close();
      await platform.$disconnect();
      await mailpit.stop();
    }
  });

  it("logs a failing job by queue, job and names and codes only, and nothing reaches the console but that line", async () => {
    const output = consoleOutput();
    const services = createServices(environment(), processLog("worker"));
    try {
      await services.jobs.start();
      const leaky = Object.assign(
        new Error("no mailbox for jane.doe@example.com", { cause: new Error("rejected jane.doe@example.com") }),
        { code: "EENVELOPE", response: "550 jane.doe@example.com unknown" },
      );
      await services.jobs.work("probe.leaky", () => Promise.reject(leaky));
      const id = await services.jobs.send("probe.leaky", {}, { retryLimit: 0 });
      await eventually(
        () => services.jobs.failedJobs(),
        (failed) => failed.some((job) => job.id === id),
        "the job to fail",
      );
      expect(output()).toEqual([
        `worker: queue probe.leaky, job ${String(id)} failed: Error EENVELOPE, caused by Error`,
      ]);
      expect(output().join("\n")).not.toMatch(/jane/);
    } finally {
      await services.close();
    }
  });

  it("holds each organization to its plan's seats and storage", async () => {
    const services = createServices(environment(), processLog("api"));
    const platform = createPlatformClient(inject("dbUrls").platform);
    try {
      const organizationId = await createTestOrganization(platform, "Small agency");
      const plan = await platform.plan.create({
        data: {
          key: `one-seat-${organizationId.slice(-12)}`,
          name: "One seat",
          monthlyPricePaise: 0,
          seatLimit: 1,
          whatsappNumberLimit: 0,
          storageLimitBytes: 1000n,
          modules: ["crm"],
        },
      });
      await platform.subscription.create({
        data: {
          organizationId,
          planId: plan.id,
          billingCycle: "monthly",
          status: "active",
          statusChangedAt: new Date(),
          paidThrough: new Date("2099-12-31"),
        },
      });
      await services.identity.seedStarterRoles(organizationId);
      const owner = await services.identity.createOrganizationOwner(organizationId, {
        name: "Asha Owner",
        email: `owner-${organizationId}@example.test`,
        password: "owner-password-1",
        mustChangePassword: false,
      });
      const access = await services.identity.resolveAccess(owner.userId, organizationId);
      if (!access) throw new Error("the owner has no access");
      // The Owner has the plan's one seat.
      await expect(
        services.identity.staff.create(access, {
          name: "Ravi",
          username: "ravi",
          roleKey: "sales",
          temporaryPassword: "ravi-password-1",
        }),
      ).rejects.toMatchObject({ reason: "SEAT_LIMIT_REACHED" });
      await expect(
        services.files.requestUpload(access, {
          recordType: "lead",
          recordId: crypto.randomUUID(),
          fileName: "itinerary.pdf",
          contentType: "application/pdf",
          sizeBytes: 1001,
          sensitive: false,
        }),
      ).rejects.toMatchObject({ reason: "STORAGE_LIMIT_REACHED" });
    } finally {
      await services.close();
      await platform.$disconnect();
    }
  });

  it("derives the rate limiter's 32-byte key from the auth secret, the same way every time", () => {
    const key = rateLimitKeySecret(secret);
    expect(key).toHaveLength(32);
    expect(rateLimitKeySecret(secret)).toEqual(key);
    expect(rateLimitKeySecret(`${secret}-rotated`)).not.toEqual(key);
    expect(Buffer.from(key).toString("utf8")).not.toContain(secret.slice(0, 8));
  });
});

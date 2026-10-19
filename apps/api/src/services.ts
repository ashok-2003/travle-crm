// What the api and the worker run on, built once per process from the environment: the database, identity, the
// adapters (S3, SMTP, web push, pg-boss) and the services made from them, held to each organization's plan limits.
// close() releases every pool.
import { hkdfSync } from "node:crypto";
import { createDatabase, type Database, type ForOrgOptions } from "@travel-crm/db";
import { createFiles, type Files } from "@travel-crm/domain/files";
import { createIdentity, type Identity, type SeatLimit } from "@travel-crm/domain/identity";
import { createProfiles, type Profiles } from "@travel-crm/domain/profile";
import { createRateLimiter, type RateLimiter } from "@travel-crm/domain/rate-limits";
import { createSubscriptionAccess, planLimits, type SubscriptionAccess } from "@travel-crm/domain/subscriptions";
import { createSmtpEmailSender, type EmailSender } from "@travel-crm/integrations/email";
import { createRealGoogleSheets, type GoogleSheets } from "@travel-crm/integrations/google-sheets";
import { createPgBossJobs, type PgBossJobs } from "@travel-crm/integrations/jobs";
import { createWebPushSender, type PushSender } from "@travel-crm/integrations/push";
import { createSpreadsheets, type Spreadsheets } from "@travel-crm/integrations/spreadsheets";
import { createS3Storage, type ObjectStorage } from "@travel-crm/integrations/storage";
import { authSettingsFrom, type Environment } from "./environment.js";
import { passwordResetEmails, resetPasswordPageOf } from "./password-reset-email.js";
import type { ProcessLog } from "./process-log.js";

export interface Services {
  environment: Environment;
  db: Database;
  identity: Identity;
  /** Organizations' business profiles. */
  profiles: Profiles;
  storage: ObjectStorage;
  files: Files;
  /** Reads and writes CSV and .xlsx files: only the worker reads one (ADR 0030). */
  spreadsheets: Spreadsheets;
  /** Reads Google Sheets, read only (ADR 0031); null when no service account is set: Google Sheets is off. */
  google: GoogleSheets | null;
  /** What each organization's plan allows today, for the jobs that act for a person (an import's add). */
  subscriptions: SubscriptionAccess;
  /** The seats each organization's plan gives, for the staff import's add. */
  seatLimit: SeatLimit;
  /** pg-boss: the api sends jobs to it (webhooks), the worker also runs them. */
  jobs: PgBossJobs;
  email: EmailSender;
  push: PushSender;
  rateLimiter: RateLimiter;
  /** Checks the database role and the storage bucket, then starts pg-boss. Call before serving requests or working. */
  start(): Promise<void>;
  /** Stops pg-boss (waiting for running jobs) and closes the database pools. */
  close(): Promise<void>;
}

/**
 * The rate limiter's key secret, derived from BETTER_AUTH_SECRET (ADR 0013), so there is no new variable to set.
 * HKDF with its own label: the derived key reveals nothing about the session secret, and rotating that secret only
 * resets the counts.
 */
export function rateLimitKeySecret(betterAuthSecret: string): Uint8Array {
  return new Uint8Array(hkdfSync("sha256", betterAuthSecret, "", "rate-limit-keys", 32));
}

/** The limits every database transaction of the process takes where the code names none (DATABASE_TRANSACTION_*). */
export function transactionLimitsOf(environment: Environment): ForOrgOptions {
  return {
    maxWait: environment.DATABASE_TRANSACTION_MAX_WAIT_MS,
    timeout: environment.DATABASE_TRANSACTION_TIMEOUT_MS,
  };
}

/** The real Google adapter for the service accounts the environment holds, or none when it holds none. */
export function googleSheetsOf(environment: Environment): GoogleSheets | null {
  const accounts = environment.GOOGLE_SHEETS_SERVICE_ACCOUNTS;
  if (accounts === undefined) return null;
  const testServer = environment.GOOGLE_SHEETS_TEST_SERVER_URL;
  // The journeys' fake Google takes any token and any key: a fixed token spares signing one (development and tests only).
  return testServer === undefined
    ? createRealGoogleSheets({ accounts })
    : createRealGoogleSheets({ accounts, apiBaseUrl: testServer, accessToken: () => Promise.resolve("test-token") });
}

/** `log` is the process's one log: pg-boss's problems go there, as ids and codes. */
export function createServices(environment: Environment, log: ProcessLog): Services {
  const db = createDatabase(environment.DATABASE_URL, {
    maxConnections: environment.DATABASE_POOL_SIZE,
    transactionLimits: transactionLimitsOf(environment),
  });
  const rateLimiter = createRateLimiter(db, { keySecret: rateLimitKeySecret(environment.BETTER_AUTH_SECRET) });
  // Seats and storage are the plan's (spec 7.2): identity refuses staff past them, the files module uploads. The api's
  // request checks read the same entitlements through an access of their own (server.ts).
  const subscriptions = createSubscriptionAccess({ db });
  const limits = planLimits(subscriptions);
  const email = createSmtpEmailSender({
    host: environment.SMTP_HOST,
    port: environment.SMTP_PORT,
    secure: environment.SMTP_SECURE,
    user: environment.SMTP_USER,
    password: environment.SMTP_PASSWORD,
    fromAddress: environment.EMAIL_FROM_ADDRESS,
  });
  const identity = createIdentity({
    databaseUrl: environment.DATABASE_URL,
    maxConnections: environment.DATABASE_POOL_SIZE,
    transactionLimits: transactionLimitsOf(environment),
    auth: {
      ...authSettingsFrom(environment),
      log,
      passwordReset: {
        sendEmail: passwordResetEmails(email, rateLimiter, log),
        pageUrl: resetPasswordPageOf(environment.APP_URL),
      },
    },
    seatLimit: limits.seats,
  });
  // The concrete S3 adapter, for its start-up check; everything else gets the port.
  const s3 = createS3Storage({
    endpoint: environment.S3_ENDPOINT,
    region: environment.S3_REGION,
    bucket: environment.S3_BUCKET,
    accessKeyId: environment.S3_ACCESS_KEY_ID,
    secretAccessKey: environment.S3_SECRET_ACCESS_KEY,
    forcePathStyle: environment.S3_FORCE_PATH_STYLE,
  });
  const storage: ObjectStorage = s3;
  const jobs = createPgBossJobs({
    connectionString: environment.DATABASE_URL,
    log,
  });
  const push = createWebPushSender({
    publicKey: environment.VAPID_PUBLIC_KEY,
    privateKey: environment.VAPID_PRIVATE_KEY,
    subject: environment.VAPID_SUBJECT,
  });

  return {
    environment,
    db,
    identity,
    profiles: createProfiles({ db }),
    storage,
    files: createFiles({ db, storage, storageLimitBytes: limits.storageBytes }),
    spreadsheets: createSpreadsheets(),
    google: googleSheetsOf(environment),
    subscriptions,
    seatLimit: limits.seats,
    jobs,
    email,
    push,
    rateLimiter,
    start: async () => {
      // A DATABASE_URL for the wrong role (app_migrator, say) would otherwise fail every request and job while the
      // process looked healthy: the first query checks the role, so make one now.
      await db.withoutOrg(() => Promise.resolve());
      // A wrong bucket name or credentials would otherwise surface only at the first upload: refuse to start.
      await s3.checkBucket();
      await jobs.start();
    },
    close: async () => {
      await jobs.stop();
      await identity.disconnect();
      await db.disconnect();
    },
  };
}

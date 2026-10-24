// What the api and the worker run on, built once per process from the environment: the database, identity, the
// adapters (S3, SMTP, web push, pg-boss) and the services made from them, held to each organization's plan limits.
// close() releases every pool.
import { hkdfSync } from "node:crypto";
import { createDatabase, type Database, type ForOrgOptions } from "@travel-crm/db";
import { createFiles, type Files } from "@travel-crm/domain/files";
import { createIdentity, type Identity, type SeatLimit } from "@travel-crm/domain/identity";
import { createProfiles, type Profiles } from "@travel-crm/domain/profile";
import { createRateLimiter, type RateLimiter } from "@travel-crm/domain/rate-limits";
import { createSheetsHashes, type SheetsHashes } from "@travel-crm/domain/sheets";
import { createSubscriptionAccess, planLimits, type SubscriptionAccess } from "@travel-crm/domain/subscriptions";
import { createTurnstileBotCheck, type BotCheck } from "@travel-crm/integrations/bot-check";
import { createSmtpEmailSender, type EmailSender } from "@travel-crm/integrations/email";
import { createRealGoogleSheets, type GoogleSheets } from "@travel-crm/integrations/google-sheets";
import { createPgBossJobs, type PgBossJobs } from "@travel-crm/integrations/jobs";
import type { Logger } from "@travel-crm/integrations/logging";
import { createWebPushSender, type PushSender } from "@travel-crm/integrations/push";
import { createSpreadsheets, type Spreadsheets } from "@travel-crm/integrations/spreadsheets";
import { createS3Storage, type ObjectStorage } from "@travel-crm/integrations/storage";
import { authSettingsFrom, type Environment } from "./environment.js";
import { passwordResetEmails, resetPasswordPageOf } from "./password-reset-email.js";
import { createMetaServices, type MetaServices } from "./meta-services.js";
import { createWhatsAppServices, type WhatsAppServices } from "./whatsapp-services.js";
import { loggerOfRequest } from "./request-log.js";
import { verifySheetsKey } from "./sheets-key-check.js";

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
  /** Keys the spreadsheet claim and the erasure tombstones; null when SHEETS_HASH_KEY is not set (S4, S43). */
  sheetsHashes: SheetsHashes | null;
  /** The Meta lead ads (ADR 0034); null when the five Meta settings are not set: Meta is off. */
  meta: MetaServices | null;
  /** WhatsApp through MSG91 (ADR 0035); null when the three MSG91 settings are not set: WhatsApp is off. */
  whatsapp: WhatsAppServices | null;
  /** What each organization's plan allows today, for the jobs that act for a person (an import's add). */
  subscriptions: SubscriptionAccess;
  /** The seats each organization's plan gives, for the staff import's add. */
  seatLimit: SeatLimit;
  /** pg-boss: the api sends jobs to it (webhooks), the worker also runs them. */
  jobs: PgBossJobs;
  email: EmailSender;
  push: PushSender;
  rateLimiter: RateLimiter;
  /** Asks Cloudflare Turnstile whether a form's visitor is a person; null when no keys are set (W39). */
  botCheck: BotCheck | null;
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
export function googleSheetsOf(environment: Environment, logger: Logger): GoogleSheets | null {
  const accounts = environment.GOOGLE_SHEETS_SERVICE_ACCOUNTS;
  if (accounts === undefined) return null;
  const testServer = environment.GOOGLE_SHEETS_TEST_SERVER_URL;
  // The journeys' fake Google takes any token and any key: a fixed token spares signing one (development and tests only).
  return testServer === undefined
    ? createRealGoogleSheets({ accounts, logger })
    : createRealGoogleSheets({
        accounts,
        logger,
        apiBaseUrl: testServer,
        accessToken: () => Promise.resolve("test-token"),
      });
}

/** `logger` is the process's structured log: pg-boss's problems and job lines go there, as ids, codes and timings. */
export function createServices(environment: Environment, logger: Logger): Services {
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
  // Better Auth and the reset emails run inside requests: their lines carry the request's id.
  const requestLogger = loggerOfRequest(logger);
  const identity = createIdentity({
    databaseUrl: environment.DATABASE_URL,
    maxConnections: environment.DATABASE_POOL_SIZE,
    transactionLimits: transactionLimitsOf(environment),
    auth: {
      ...authSettingsFrom(environment),
      log: requestLogger,
      passwordReset: {
        sendEmail: passwordResetEmails(email, rateLimiter, requestLogger),
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
    logger,
  });
  const push = createWebPushSender({
    publicKey: environment.VAPID_PUBLIC_KEY,
    privateKey: environment.VAPID_PRIVATE_KEY,
    subject: environment.VAPID_SUBJECT,
  });

  const { TURNSTILE_SECRET_KEY: turnstileSecret, TURNSTILE_VERIFY_URL: turnstileVerifyUrl } = environment;
  const botCheck =
    turnstileSecret === undefined
      ? null
      : createTurnstileBotCheck({
          secretKey: turnstileSecret,
          logger,
          ...(turnstileVerifyUrl === undefined ? {} : { verifyUrl: turnstileVerifyUrl }),
        });

  return {
    environment,
    db,
    identity,
    profiles: createProfiles({ db }),
    storage,
    files: createFiles({ db, storage, storageLimitBytes: limits.storageBytes }),
    spreadsheets: createSpreadsheets(),
    google: googleSheetsOf(environment, logger),
    sheetsHashes: environment.SHEETS_HASH_KEY === undefined ? null : createSheetsHashes(environment.SHEETS_HASH_KEY),
    meta: createMetaServices(environment, { db, rateLimiter, logger }),
    whatsapp: createWhatsAppServices(environment),
    subscriptions,
    seatLimit: limits.seats,
    jobs,
    email,
    push,
    rateLimiter,
    botCheck,
    start: async () => {
      // A DATABASE_URL for the wrong role (app_migrator, say) would otherwise fail every request and job while the
      // process looked healthy: the first query checks the role, so make one now.
      await db.withoutOrg(() => Promise.resolve());
      // Every process that holds the sheets hash key holds the same one (SC8): a different key quietly breaks the claims.
      if (environment.SHEETS_HASH_KEY !== undefined) await verifySheetsKey(db, environment.SHEETS_HASH_KEY);
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

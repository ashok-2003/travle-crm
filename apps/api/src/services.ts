// What the api and the worker run on, built once per process from the environment: the database, identity, the
// adapters (S3, SMTP, web push, pg-boss) and the services made from them. close() releases every pool.
import { hkdfSync } from "node:crypto";
import { createDatabase, type Database } from "@travel-crm/db";
import { createFiles, type Files } from "@travel-crm/domain/files";
import { createIdentity, type Identity } from "@travel-crm/domain/identity";
import { createRateLimiter, type RateLimiter } from "@travel-crm/domain/rate-limits";
import { createSmtpEmailSender, type EmailSender } from "@travel-crm/integrations/email";
import { createPgBossJobs, type PgBossJobs } from "@travel-crm/integrations/jobs";
import { createWebPushSender, type PushSender } from "@travel-crm/integrations/push";
import { createS3Storage, type ObjectStorage } from "@travel-crm/integrations/storage";
import { authSettingsFrom, type Environment } from "./environment.js";
import { passwordResetEmails } from "./password-reset-email.js";

export interface Services {
  environment: Environment;
  db: Database;
  identity: Identity;
  storage: ObjectStorage;
  files: Files;
  /** pg-boss: the api sends jobs to it (webhooks), the worker also runs them. */
  jobs: PgBossJobs;
  email: EmailSender;
  push: PushSender;
  rateLimiter: RateLimiter;
  /** Checks the storage bucket, then starts pg-boss. Call before serving requests or running the worker. */
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

export function createServices(environment: Environment): Services {
  const db = createDatabase(environment.DATABASE_URL, { maxConnections: environment.DATABASE_POOL_SIZE });
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
    auth: { ...authSettingsFrom(environment), sendPasswordResetEmail: passwordResetEmails(email) },
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
    onError: (error) => {
      console.error("pg-boss error", error);
    },
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
    storage,
    files: createFiles({ db, storage }),
    jobs,
    email,
    push,
    rateLimiter: createRateLimiter(db, { keySecret: rateLimitKeySecret(environment.BETTER_AUTH_SECRET) }),
    start: async () => {
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

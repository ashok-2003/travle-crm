// The environment variables of the services plan 3 added (spec 9): object storage, email, web push, and the web
// app's address that emails link to. Part of the api's one checked environment (environment.ts).
import { z } from "zod";
import { decodeServiceAccounts } from "./sheets-settings.js";

const httpUrl = z.url({ protocol: /^https?$/, message: "must be an http(s) URL" });

/** A setting passed through from a compose file or a .env left blank is the same as unset. */
function emptyAsUnset<Schema extends z.ZodType>(schema: Schema) {
  return z.preprocess((value) => (value === "" ? undefined : value), schema);
}

export const serviceVariables = {
  /** Where people open the web app: links in emails and pushes point there, and password resets come back to it. */
  APP_URL: httpUrl.default("http://localhost:3000"),
  /** An S3-compatible server's address, e.g. MinIO's locally. Leave it out for AWS S3. */
  S3_ENDPOINT: httpUrl.optional(),
  S3_REGION: z.string().min(1).default("ap-south-1"),
  S3_BUCKET: z.string().regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/, "must be an S3 bucket name"),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  /** MinIO needs the bucket in the path rather than the host name. */
  S3_FORCE_PATH_STYLE: z.stringbool().default(false),
  /** SMTP, or Amazon SES's SMTP interface; Mailpit locally. */
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  /**
   * TLS from the first byte (port 465). Otherwise STARTTLS: mandatory whenever SMTP_USER is set, so credentials never
   * cross in clear text, and used when the server offers it otherwise.
   */
  SMTP_SECURE: z.stringbool().default(false),
  /** SMTP credentials: both or neither (environment.ts checks the pair). */
  SMTP_USER: z.string().min(1).optional(),
  SMTP_PASSWORD: z.string().min(1).optional(),
  /** Email comes from our domain (spec 9.4), under the organization's name, e.g. no-reply@mail.<our domain>. */
  EMAIL_FROM_ADDRESS: z.email(),
  /** Web push's VAPID key pair: `pnpm --filter @travel-crm/integrations exec web-push generate-vapid-keys`. */
  VAPID_PUBLIC_KEY: z.string().min(1),
  VAPID_PRIVATE_KEY: z.string().min(1),
  /** How push services reach us about problems: "mailto:" an address, or an https URL. */
  VAPID_SUBJECT: z.string().regex(/^(mailto:|https:\/\/)/, 'must start with "mailto:" or "https://"'),
  /**
   * The Google Sheets sync's service accounts (spec 14): one key file's JSON or a JSON list, as single-line JSON or
   * base64. Read by the api and the worker, never the console. Unset or empty: Google Sheets is off.
   */
  GOOGLE_SHEETS_SERVICE_ACCOUNTS: emptyAsUnset(
    z
      .string()
      .transform((text, context) => {
        const accounts = decodeServiceAccounts(text);
        if (accounts === null) {
          context.addIssue({
            code: "custom",
            message:
              "must be a service account's key file as JSON or base64, or a list of them, each with a private_key that parses (keep its newlines as they are in the file)",
          });
          return z.NEVER;
        }
        return accounts;
      })
      .optional(),
  ),
  /**
   * Keys the spreadsheet claim and the erasure tombstones (S4, S43): at least 32 random characters, in the environment
   * only, never stored or logged and never changed. Needed whenever the accounts are set (environment.ts checks).
   */
  SHEETS_HASH_KEY: emptyAsUnset(z.string().min(32, "must be at least 32 characters").optional()),
  /** The journeys' fake Google (development and tests only; refused in production, S17). */
  GOOGLE_SHEETS_TEST_SERVER_URL: emptyAsUnset(httpUrl.optional()),
  /** How often a sheet is checked, in seconds (120 by default); the journeys shorten it (development and tests only). */
  SHEETS_CHECK_INTERVAL_SECONDS: emptyAsUnset(z.coerce.number().int().min(1).max(3600).optional()),
};

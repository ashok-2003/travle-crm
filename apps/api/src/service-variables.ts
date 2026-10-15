// The environment variables of the services plan 3 added (spec 9): object storage, email, web push, and the web
// app's address that emails link to. Part of the api's one checked environment (environment.ts).
import { z } from "zod";

const httpUrl = z.url({ protocol: /^https?$/, message: "must be an http(s) URL" });

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
};

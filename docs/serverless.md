# The serverless pilot: Neon, Render and Vercel

How the product runs for the pilot on free plans, and how to set it up, step by step. It stands in until a VM is
rented; then `docs/runbook.md` applies (its scripts run on any Ubuntu VM: EC2, Compute Engine, Oracle). What any
deploy must get right is in `docs/deploy-checklist.md`.

## What runs where

| Piece                       | Where                                                                              | Free plan's limits                                             |
| --------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Web app (Next.js)           | Vercel Hobby, Singapore functions (`apps/web/vercel.json`)                         | Hobby is for non-commercial use (the owner's call, 2026-10-18) |
| api **and** worker          | Render free web service `travel-crm-api`, Singapore, command `api-and-worker`      | sleeps after 15 idle minutes, about a minute to wake; 0.1 CPU  |
| Console                     | Render free web service `travel-crm-console`, Singapore, command `console`         | the same; Render's 750 free hours a month are shared by both   |
| Database (Postgres 17 / 18) | Neon free, AWS Singapore                                                           | 100 compute-hours a month (it sleeps 5 minutes after the api)  |
| Files                       | Cloudflare R2, bucket `travel-crm-files`                                           | 10 GB                                                          |
| Email                       | Brevo SMTP, **port 2525** (Render's free plan blocks 25, 465 and 587)              | 300 a day                                                      |
| Backups                     | GitHub Actions, nightly (`.github/workflows/backup.yml`) → R2 `travel-crm-backups` | Neon's free plan keeps only 6 hours of history                 |

The browser only ever talks to the Vercel address. The web app rewrites `/api/platform/*` to the console, and
`/api/*`, `/p/*` and `/webhooks/*` to the api (`API_ORIGIN` and `CONSOLE_ORIGIN`, fixed when Vercel builds it), so
cookies stay first-party and the api needs no CORS.

**What the free plans cost the pilot** (the owner accepted these on 2026-10-18):

- **Cold starts:** after 15 quiet minutes the first visit waits about a minute. The optional keep-warm in step 9 avoids
  that during working hours.
- **Background work runs only while the api is awake.** The worker shares its container, so invites and notifications
  go out while someone uses the app. The nightly jobs (the console's subscription records, file sweeps, rate-limit
  clean-up) run only if their service happens to be awake. That's safe: access is worked out on every request anyway.
- **One sign-in limit for everyone:** behind Vercel and Render the api can't trust a client's address, so all sign-ins
  share one limit (3 wrong tries in 10 seconds). Guessing passwords stays slow, but two staff signing in at the same
  moment may be asked to wait a few seconds.
- **Speed:** 0.1 of a CPU makes PDFs and cold starts slow. If the agency finds it sluggish, Render's Starter plan
  ($7 a month) for the api alone is the first upgrade.
- **The data is in Singapore.**

## Set it up

Have these open: Neon, Render and Vercel (each can sign in with GitHub), Cloudflare (R2), Brevo, and the repository's
settings on GitHub. Keep every value the steps make in your password manager, and never paste one into a chat.

### 1. Cloudflare R2: files and backups

1. **R2 Object Storage**: create two private buckets with the location hint **Asia-Pacific**: `travel-crm-files` and
   `travel-crm-backups`.
2. On `travel-crm-backups`: **Settings → Object lifecycle rules → Add rule**, for all objects, **delete 14 days after
   upload**.
3. **Manage API tokens → Create API token**, twice, each **Object Read & Write** on one bucket only: `travel-crm-app`
   for `travel-crm-files`, `travel-crm-backups` for `travel-crm-backups`. Each shows an access key id, a secret access
   key, and the S3 endpoint `https://<account id>.r2.cloudflarestorage.com`.
4. On `travel-crm-files`: **Settings → CORS policy**, with the Vercel address from step 5 (decide its name now:
   `travel-crm` gives `https://travel-crm.vercel.app` if the name is free):

   ```json
   [
     {
       "AllowedOrigins": ["https://travel-crm.vercel.app"],
       "AllowedMethods": ["PUT", "GET"],
       "AllowedHeaders": ["content-type", "if-none-match"]
     }
   ]
   ```

### 2. Brevo: email

1. **Senders, Domains & Dedicated IPs → Senders → Add a sender**, and verify it with the code Brevo sends.
2. **Settings → SMTP & API → SMTP → Generate a new SMTP key**. Keep the key and the **Login** shown there.

### 3. Neon: the database

1. **New project** `travel-crm`, **Postgres 18**, region **AWS Asia Pacific (Singapore)**.
2. **Databases → New database** `travel_crm`, owner `neondb_owner`.
3. **Connect**, with database `travel_crm` and **Connection pooling off**: note the host (`ep-…….aws.neon.tech`, no
   `-pooler`) and `neondb_owner`'s connection string. That string is `DATABASE_ADMIN_URL`, for the backups (step 8).
   Neon's `neondb_owner` can create databases and roles and bypasses row-level security, without being a superuser:
   all the steps below need.
4. On your Mac, in a checkout of the repository (in your own terminal, not a chat):

   ```sh
   scripts/serverless/setup-values.sh <the host> travel_crm
   ```

   It prints the SQL that makes the product's three database roles, and the settings for Render: the three connection
   strings, `BETTER_AUTH_SECRET` and the web push pair. Save all of it in your password manager.

5. **SQL Editor**, database `travel_crm`: paste the SQL, **Run**.
6. Apply the migrations (and before every release that brings new ones, "Day to day"):
   `docker run --rm --env DATABASE_MIGRATOR_URL='<from setup-values>' <the api image> migrate`.

### 4. Render: the api (with the worker) and the console

1. **Environment Groups → New** `travel-crm-shared`, with what both services share:

   | Variable                                   | Value                                                        |
   | ------------------------------------------ | ------------------------------------------------------------ |
   | `DATABASE_URL`                             | from setup-values                                            |
   | `DATABASE_POOL_SIZE`                       | `5`                                                          |
   | `DATABASE_TRANSACTION_MAX_WAIT_MS`         | `20000` (a tenth of a CPU opens its first connection slowly) |
   | `DATABASE_TRANSACTION_TIMEOUT_MS`          | `30000`                                                      |
   | `BETTER_AUTH_SECRET`                       | from setup-values                                            |
   | `BETTER_AUTH_URL`, `APP_URL`               | the Vercel address, e.g. `https://travel-crm.vercel.app`     |
   | `S3_ENDPOINT`                              | R2's endpoint                                                |
   | `S3_REGION`                                | `auto`                                                       |
   | `S3_BUCKET`                                | `travel-crm-files`                                           |
   | `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | the `travel-crm-app` token's                                 |
   | `S3_FORCE_PATH_STYLE`                      | `true`                                                       |
   | `SMTP_HOST`                                | `smtp-relay.brevo.com`                                       |
   | `SMTP_PORT`                                | `2525`                                                       |
   | `SMTP_USER`, `SMTP_PASSWORD`               | Brevo's login and SMTP key                                   |
   | `EMAIL_FROM_ADDRESS`                       | the sender Brevo verified                                    |
   | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`    | from setup-values                                            |
   | `VAPID_SUBJECT`                            | `mailto:` and your email                                     |
   | `SHEETS_HASH_KEY` (with Google Sheets)     | `openssl rand -base64 32`, never changed                     |

   `GOOGLE_SHEETS_SERVICE_ACCOUNTS` is set on `travel-crm-api` alone, never in the group (docs/deploy-checklist.md,
   "Google Sheets"); the console drops it if it is given one.

2. **New → Web Service**, from the GitHub repository, for the api:
   - name `travel-crm-api`, region **Singapore**, branch `main`, instance type **Free**;
   - language **Docker**, Dockerfile path `apps/api/Dockerfile`, build context `.` (the repository's root);
   - **Docker Command** `/app/apps/api/docker-entrypoint.sh api-and-worker` (Render's Docker Command replaces the
     image's entrypoint, not just its arguments: plain `api-and-worker` exits 128 without a word), **Health Check
     Path** `/health`;
   - link the environment group. Leave `DATABASE_MIGRATOR_URL` out: the api would apply migrations on every start,
     and on a tenth of a CPU that adds about 25 seconds to each cold start (step 3 applies them instead).
3. **New → Web Service** again, for the console: the same, but name `travel-crm-console`, **Docker Command**
   `/app/apps/api/docker-entrypoint.sh console`, and its own variables beside the group: `DATABASE_PLATFORM_URL` (from setup-values) and
   `CONSOLE_PORT` = `10000` (the port Render sends traffic to).
4. Wait for both to be **Live**, and use the addresses Render shows: a name someone else holds gets a suffix
   (`travel-crm-api.onrender.com` was taken on 2026-10-19). Vercel's `API_ORIGIN` and `CONSOLE_ORIGIN` are those.

### 5. Vercel: the web app

1. **Add New → Project**, import the repository, **Root Directory** `apps/web` (the rest comes from
   `apps/web/vercel.json`). Name it as decided in step 1.
2. **Environment Variables** (all environments):
   - `API_ORIGIN` = the api's Render address
   - `CONSOLE_ORIGIN` = the console's Render address
   - `STORAGE_ORIGIN` = R2's endpoint
   - `ENABLE_EXPERIMENTAL_COREPACK` = `1` (so Vercel uses the pnpm version `package.json` names)
3. **Settings → Build and Deployment → Node.js Version** `24.x`. **Deploy.**
4. If the address isn't the one you planned, change `BETTER_AUTH_URL` and `APP_URL` in the Render group and R2's CORS
   rule to it. Changing `API_ORIGIN` or `CONSOLE_ORIGIN` later needs a Vercel redeploy, since the build holds them.

### 5b. The website form: the proxy hops, Turnstile and staying awake

The form works with nothing set. These three make it safe and fast on the Render and Vercel pilot.

1. **Choose `PUBLIC_FORM_PROXY_HOPS`** (needed here, not on Oracle). After the deploy:
   1. From a phone on mobile data open `<Vercel address>/api/public/client-address`. It shows `address`, `entries` and
      `hops`. Compare `address` with what a "what is my IP" site shows.
   2. In a terminal run `curl -H 'X-Forwarded-For: 9.9.9.9, 8.8.8.8' <Vercel address>/api/public/client-address`. The
      `address` must still be yours, not 9.9.9.9 or 8.8.8.8.
   3. In Render, on `travel-crm-api` (not the group), set `PUBLIC_FORM_PROXY_HOPS` to `1`, redeploy, and repeat both
      checks. If the address is Vercel's or a forged one, try `2`. Keep the first value for which both pass. If `entries`
      is 1 with `hops` unset, Vercel is replacing the header and Render is not adding to it: stop and ask for help.
      Repeat after any change of host.
2. **Optional: switch on Turnstile** (free). Sign in at dash.cloudflare.com, open **Turnstile**, **Add widget**; name it
   "travel-crm forms"; under hostnames add the Vercel address (for example `travel-crm.vercel.app`) and your own domain if
   you add one; mode **Managed**. Copy the **Site key** and the **Secret key**. In Render, on `travel-crm-api`, add
   `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` (the secret as a secret) and redeploy. Both or neither: one alone stops
   the api with a message naming the variable. Agencies' own websites need no entry: the widget runs inside our page.
3. **Keep the api awake longer** if agencies get enquiries in the evening. The free Render service sleeps after 15 idle
   minutes, and a visitor whose enquiry wakes it waits up to a minute (the form says so and keeps the enquiry). The
   cron-job.org ping in step 9 runs in working hours only: widen it in step with your agencies' ad hours, mindful of
   Neon's free compute hours. The form's own paths (`/api/public/website-forms/...`) can be added to that list.

### 6. The first super admin

On your Mac (it prints a temporary password, to change at your first sign-in):

```sh
docker build --file apps/api/Dockerfile --tag travel-crm-api .
# console.env: the Render group's variables plus DATABASE_PLATFORM_URL, one NAME=value per line
docker run --rm --env-file console.env travel-crm-api first-super-admin --email <you> --name "<your name>"
rm console.env
```

### 7. Check it

```sh
HEALTH_URL=https://travel-crm-api.onrender.com/health scripts/server/smoke.sh https://travel-crm.vercel.app
```

It checks HTTPS, every route, the security headers and the sign-in limit (wake the api first: open the site once).
Then sign in to `/console`, invite yourself to a test agency, and use **Forgot password**: both emails should arrive
(look in spam too, and say how they landed).

### 8. Nightly backups (GitHub Actions)

The workflow is on `main`. In the repository's **Settings → Secrets and variables → Actions**:

- **Secrets:** `DATABASE_ADMIN_URL` (`neondb_owner`'s connection string from step 3), `BACKUP_S3_ACCESS_KEY_ID` and
  `BACKUP_S3_SECRET_ACCESS_KEY` (the `travel-crm-backups` token's), and optionally `BACKUP_HEARTBEAT_URL`.
- **Variables:** `BACKUP_ENABLED` = `true`, `S3_ENDPOINT`, `BACKUP_S3_BUCKET` = `travel-crm-backups`, and
  `BACKUP_AGE_RECIPIENT` = the public half of your backup key (`age-keygen -y ~/.config/travel-crm/backup-key.txt`).
  Neon's owner bypasses row-level security itself (checked on 2026-10-18), so `DATABASE_ADMIN_ROLE` stays unset; a
  provider whose admin bypasses it only through another role names that role there.

Then **Actions → Database backup → Run workflow**, and check the dump lands in R2 under `db/`.

**The restore drill** (once now, then every quarter), on your Mac. Put the backups' settings in
`~/.config/travel-crm/backups.env` (`chmod 600`), one `NAME='value'` per line: `S3_ENDPOINT`, `BACKUP_S3_BUCKET`,
`BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY`, and for production's counts beside the copy's,
`DATABASE_ADMIN_URL`. Then:

```sh
TRAVEL_CRM_SETTINGS=~/.config/travel-crm/backups.env API_IMAGE=travel-crm-api \
  scripts/server/restore-check.sh < ~/.config/travel-crm/backup-key.txt
```

It restores the newest backup into a throwaway Postgres on your Mac, runs the migrations there, checks the console's
grant, counts what came back, and deletes the copy.

### 9. Wake-ups: working hours, and the console's night

Two free jobs on cron-job.org, in the time zone Asia/Kolkata, both calling **through the Vercel address**. Render wakes
a sleeping free service for a call that comes that way, but answers a pinger calling its own `onrender.com` address
with a page of its own (cron-job.org: "output too large") and leaves it asleep:

| Job                   | URL                                    | Crontab              |
| --------------------- | -------------------------------------- | -------------------- |
| api, working hours    | `<Vercel address>/api/auth/ok`         | `*/10 11-19 * * 1-6` |
| console, demo rebuild | `<Vercel address>/api/platform/health` | `55,57 1 * * *`      |

The api's job spares the agency cold starts from 11:00 to about 20:05, Monday to Saturday. The console's wakes it for its
02:00 demo rebuild, which otherwise never runs while it sleeps. The first call of a wake fails on cron-job.org's 30-second
timeout while the service starts, and the next one answers; cron-job.org switches off a job after many failures in a
row, hence the console's second call. Together they keep Neon at about 60 of its 100 free compute-hours a month, and
Render well inside its 750 hours. Don't keep either awake around the clock: Neon's free compute would run out mid-month,
and the database would stop until the next month.

## Day to day

- **The website form's release brings migration `20261029100000_website_form`: apply it by hand first,** with step 3's
  `migrate`, before the merge deploys. It only adds, so the old release keeps working while it applies.
- **Deploy:** when the release brings migrations, apply them first (step 3's `migrate`, from a Mac with the release's
  image). Then push to `main` (merge the release): Render rebuilds the api and the console, and Vercel the web app.
  Migrations must suit the old release too (the checklist's "Migrations"), since it serves while they apply.
- **Roll back:** Render: the service's **Events → Rollback** to the deploy before. Vercel: **Deployments → … →
  Promote** the one before. Never undo a migration; the old release still works with the new schema.
- **Logs:** each Render service's **Logs**, and Vercel's **Logs**. The processes log ids and codes, never a person's
  data.
- **Rotate a secret:** change it in the Render group (or one service), and Render restarts with it. A new
  `BETTER_AUTH_SECRET` signs everyone out. Never change the VAPID pair; a new pair drops every push subscription.
- **Watch:** Neon's compute-hours and storage, Render's free hours, R2's 10 GB, Brevo's 300 a day and its bounces, and
  that a backup lands every night.

## Before the next agency

The runbook's list holds here too: two-factor on, a real domain with Brevo's domain authentication, the files
bucket's backup decision, and the legal documents. Moving to a VM (EC2 or Compute Engine in Mumbai) follows
`docs/runbook.md`: a backup restored there, the settings carried over, and the DNS pointed at it.

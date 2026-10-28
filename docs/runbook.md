# Runbook: the pilot server

How the product runs for the pilot, and what to do when something has to change or goes wrong. The deploy checklist
(`docs/deploy-checklist.md`) says what any deploy must get right. This page is about this one server. When Oracle
has no ARM capacity, two small free servers stand in for it, with a managed database and the web app on Vercel
("Two small servers (api and console)").

## What runs where

- **The server:** Oracle Cloud Always Free in Mumbai (`ap-mumbai-1`). It's a `VM.Standard.A1.Flex` running Ubuntu
  24.04, with a 100 GB boot volume. The free allowance is 2 ARM cores and 12 GB; the server starts at 1 core and 6 GB
  while Mumbai has no room for more, and grows later ("Resize the server").
  - Reach it with `ssh -i ~/.ssh/travel-crm-oracle ubuntu@<ip>`. The key is on the owner's Mac.
  - SSH takes keys only. Only 22, 80 and 443 are open, in Oracle's security list and the server's own firewall.
- **The address:** `https://<ip>.sslip.io` until a real domain comes. It's `APP_HOST` in the server's settings.
- **The product:** `docker-compose.server.yml`, run as the Compose project `travel-crm` through
  `scripts/server/compose.sh`:
  - Postgres 18, never published outside the server, unless the settings point at a managed one ("Use a managed
    database");
  - the one-off `migrate`, then the api, worker, console and web app;
  - Caddy, which ends HTTPS and routes as the checklist's table says.
  - Every container restarts on its own and keeps at most 50 MB of rotated logs.
- **On the server, in `/srv/travel-crm`:**
  - `repo.git`: the repository releases are pushed to.
  - `app`: the checkout the images are built from.
  - `production.env`: every setting and secret, root's alone, never in git.
  - `release` and `release.previous`: the commit running now, and the one before it.
- **Files:** the private Cloudflare R2 bucket `travel-crm-files`, path-style. Files have no backup (see "Before the
  next agency").
- **Backups:**
  - Every night at 01:30 India time, the database and the server's settings are encrypted with age to the owner's key
    and copied to the R2 bucket `travel-crm-backups` (under `db/` and `settings/`). R2 deletes them after 14 days.
  - Oracle also keeps weekly backups of the boot volume.
- **The backup key:** the private key is `~/.config/travel-crm/backup-key.txt` on the owner's Mac, with a copy in the
  owner's password manager. It is never on the server, so without it no backup can be read.
- **Email:** Brevo's SMTP relay (300 a day on the free plan).
- **Monitoring:** an uptime monitor calls `https://<ip>.sslip.io/health`.

Everyday commands, on the server:

    sudo /srv/travel-crm/app/scripts/server/compose.sh ps
    sudo /srv/travel-crm/app/scripts/server/compose.sh logs --since 1h api worker console

## Deploy

From a checkout on the Mac, with the commit pushed to GitHub as usual:

    SERVER=ubuntu@<ip> scripts/server/release.sh            # main
    SERVER=ubuntu@<ip> scripts/server/release.sh <commit>   # anything else

- **How it works:** it pushes the commit over SSH to the server's own repository, checks it out, and runs
  `scripts/server/deploy.sh`. That script:
  1. builds the two images (the first build takes about 15 minutes on the server; later ones reuse the cache);
  2. applies the migrations while the running release still serves;
  3. restarts the services on the new images;
  4. waits for every health check, then runs the smoke check.
- **Downtime:** the site is down for the few seconds the containers take to restart.
- **Migrations:** they must suit the old release too (expand, migrate, contract: the checklist's "Migrations"
  section). A rollback never runs a down migration.
- **If a deploy stops part-way:** it says why. The running release keeps serving, unless the restart itself failed.
  Then roll back.

Smoke-check the live address from anywhere at any time:

    scripts/server/smoke.sh https://<ip>.sslip.io

## Roll back

Deploy the commit before. The server keeps its images, so nothing is built:

    ssh -i ~/.ssh/travel-crm-oracle ubuntu@<ip> cat /srv/travel-crm/release.previous
    SERVER=ubuntu@<ip> scripts/server/release.sh <that commit>

Without the Mac, on the server:

    cd /srv/travel-crm/app && git checkout --detach "$(cat ../release.previous)" && sudo scripts/server/deploy.sh

## Backups and restoring

- **When it last ran:**
  - `systemctl list-timers travel-crm-backup` shows when it ran and runs next;
  - `journalctl -u travel-crm-backup -n 30` shows what it said;
  - a heartbeat monitor alerts on a missed night, if `BACKUP_HEARTBEAT_URL` is set.
- **Back up now:** `sudo /srv/travel-crm/app/scripts/server/backup.sh`.
- **Run the restore drill** every quarter, and after any change to backups. It takes the newest backup, decrypts it
  with the key from stdin, and restores it into a throwaway Postgres. Then it runs `migrate` there, checks the
  console's grant, counts what came back, and deletes the copy. Production is never touched. From the Mac:

      ssh -i ~/.ssh/travel-crm-oracle ubuntu@<ip> sudo /srv/travel-crm/app/scripts/server/restore-check.sh \
        < ~/.config/travel-crm/backup-key.txt

  Write the date and how long it took in the log at the end of this page.

### Restoring production's database

Do this when a bad change or a lost database means going back to a backup. Everything written since that backup is
lost, and a file deleted since the backup shows as missing. On the server, as root (`sudo -i`):

1. **Fetch the backup.** First list them, then fetch the one you want:

       cd /srv/travel-crm/app
       source scripts/docker/images.sh; source scripts/server/backup-bucket.sh; source /srv/travel-crm/production.env
       mkdir -p -m 700 /var/tmp/restore
       rclone_backups /var/tmp/restore lsf "r2:$BACKUP_S3_BUCKET/db/"
       rclone_backups /var/tmp/restore copyto "r2:$BACKUP_S3_BUCKET/db/<name>" "/backup/<name>"

2. **Put the key in memory only.** From the Mac:
   `ssh -i ~/.ssh/travel-crm-oracle ubuntu@<ip> 'umask 077; sudo tee /dev/shm/backup-key.txt >/dev/null' < ~/.config/travel-crm/backup-key.txt`

3. **Stop the product, and put the database aside:**

       scripts/server/compose.sh stop proxy api worker console
       scripts/server/compose.sh exec -T postgres psql -U postgres -c 'ALTER DATABASE travel_crm RENAME TO travel_crm_before_restore'
       scripts/server/compose.sh exec -T postgres psql -U postgres -c 'CREATE DATABASE travel_crm OWNER app_migrator'
       scripts/server/compose.sh exec -T postgres psql -U postgres -c 'REVOKE TEMPORARY ON DATABASE travel_crm FROM PUBLIC'

4. **Restore, migrate and start:**

       age --decrypt --identity /dev/shm/backup-key.txt "/var/tmp/restore/<name>" |
         scripts/server/compose.sh exec -T postgres pg_restore -U postgres -d travel_crm --exit-on-error
       rm -f /dev/shm/backup-key.txt; rm -rf /var/tmp/restore
       scripts/server/compose.sh run --rm migrate
       scripts/server/compose.sh up --detach --wait
       scripts/server/smoke.sh "https://$APP_HOST" --local

5. **Clean up:** sign in and check. Once you're sure, drop the old database:
   `DROP DATABASE travel_crm_before_restore`.

**If the whole server is lost:**

1. Make a new server (Oracle steps below).
2. Run `release.sh --push-only`, then `setup.sh`.
3. Decrypt the newest `settings/` backup on the Mac with `age --decrypt --identity ~/.config/travel-crm/backup-key.txt`,
   and copy it to `/srv/travel-crm/production.env` (root's, `chmod 600`).
4. Deploy, then restore the database as above.

## Rotate a secret

Set the new value with `secrets.sh set`, either typed or piped in, then restart:
`sudo scripts/server/compose.sh up --detach --wait` (in `/srv/travel-crm/app`). Compose recreates every service whose
settings changed.

| Secret                                                 | How                                                                                                                                                                                                                                    | What it costs           |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| `BETTER_AUTH_SECRET`                                   | `openssl rand -base64 32 \| sudo scripts/server/secrets.sh set BETTER_AUTH_SECRET`                                                                                                                                                     | everyone signs in again |
| A database role's password (the server's own Postgres) | pick `NEW=$(openssl rand -hex 32)`, run `ALTER ROLE app_runtime PASSWORD '<new>'` through `compose.sh exec -T postgres psql -U postgres`, then `secrets.sh set` both `RUNTIME_DB_PASSWORD` and `DATABASE_URL` (the password inside it) | a restart               |
| R2 tokens, Brevo's SMTP key                            | make the new one in its dashboard, `secrets.sh set` it, restart, then revoke the old one                                                                                                                                               | a restart               |
| The VAPID pair                                         | never, unless it leaked: a new pair silently drops every browser's push subscription                                                                                                                                                   | every subscription      |
| The backup key                                         | make a new one with `age-keygen`, then `secrets.sh set BACKUP_AGE_RECIPIENT` to its public key. Keep the old private key until the old backups expire, 14 days later.                                                                  | nothing                 |
| The SSH key                                            | add the new public key to `~/.ssh/authorized_keys` on the server, check that it works, then remove the old one                                                                                                                         | nothing                 |

## Resize the server

The allowance is 2 cores and 12 GB. To grow a smaller server once Oracle has room (a few minutes down):

1. On the instance's page: **Edit → Edit shape**, set the OCPUs and memory, then **Save changes**. Oracle reboots it.
   If it says out of capacity, try again later; the server keeps running as it was.
2. Give Postgres a quarter of the new memory, and reserve its huge pages, on the server:

       cd /srv/travel-crm/app
       echo "$(( $(awk '/^MemTotal:/ { print $2 }' /proc/meminfo) / 4096 ))MB" | sudo scripts/server/secrets.sh set POSTGRES_SHARED_BUFFERS
       sudo scripts/server/setup.sh && sudo reboot

3. After the reboot, Docker starts everything. Run `scripts/server/smoke.sh https://<APP_HOST>` and check that
   `sudo scripts/server/compose.sh exec postgres psql -U postgres -c 'SHOW huge_pages_status'` says `on`.

## Use a managed database

The database is three connection strings in the settings (`DATABASE_URL`, `DATABASE_PLATFORM_URL`,
`DATABASE_MIGRATOR_URL`). While they name the host `postgres`, the server runs its own Postgres. Point them at a
managed Postgres and it stops being started. What the provider must offer (the checklist's "The database"):

- Postgres 18, with `pg_trgm` and `btree_gist`;
- the three roles, without BYPASSRLS, and the grant;
- enough connections for three processes: each opens up to `2 × DATABASE_POOL_SIZE + 5`;
- a compute that stays on, because the worker and the console use it all day. Neon's free compute runs out mid-month
  for that reason, and Supabase offers Postgres 17 (October 2026).

1. **On the provider:** create a database `travel_crm`. Connected to it as the provider's admin role, run
   `packages/db/sql/bootstrap.sql` with each `PASSWORD '…'` replaced by a strong one (`openssl rand -hex 32`). Add
   `ALTER ROLE app_migrator NOCREATEDB;` at the end. If the admin role can't hand the database to `app_migrator`,
   first run `GRANT app_migrator TO <admin role>;`.
2. **On the server:** `sudo scripts/server/secrets.sh set` each of these (add `?sslmode=require` where the provider
   asks for it):
   - `DATABASE_URL` and `DATABASE_PLATFORM_URL`: `app_runtime` and `app_platform`, through the provider's pooler if it
     has one;
   - `DATABASE_MIGRATOR_URL`: `app_migrator`, connected directly, never through a transaction pooler;
   - `DATABASE_ADMIN_URL`: the provider's admin role, for the backups (every organization table forces row-level
     security, so only a role that bypasses it dumps everything);
   - `DATABASE_POOL_SIZE`: lower it if the plan allows few connections.
3. **Move the data:**
   - Run `sudo scripts/server/backup.sh` first, then stop the product: `sudo scripts/server/compose.sh stop proxy api
worker console`.
   - Restore the newest backup into the provider as in "Restoring production's database" (steps 1, 2 and 4), with
     `pg_restore --dbname "$DATABASE_ADMIN_URL"` run from the Postgres image in place of `compose.sh exec`.
4. **Start on it:** `sudo scripts/server/compose.sh up --detach --wait`, then
   `sudo scripts/server/compose.sh --profile local-database stop postgres`, then the smoke check. Keep the old
   Postgres's volume until the restore drill has passed against the new database's backups.

## Two small servers (api and console)

The pilot's free layout on Oracle's Always Free AMD servers (VM.Standard.E2.1.Micro: x86, 1 GB, two allowed), when no
ARM capacity is to be had. It replaces Render in `docs/serverless.md` and keeps the rest: Neon, R2, Brevo, the backups
in GitHub Actions and the web app on Vercel.

- **The api's server** (`SERVER_ROLE=api`): the api and the worker, and Caddy. It never holds `DATABASE_PLATFORM_URL`
  (`secrets.sh check` refuses it).
- **The console's server** (`SERVER_ROLE=console`): the console alone, and Caddy, so the platform role's connection
  string is on no server the api runs on.
- **Routes:** Vercel's rewrites are the load balancer (`API_ORIGIN` and `CONSOLE_ORIGIN` are the two servers' https
  addresses). Each server's Caddy routes only its own paths (`docker/server/Caddyfile`) and answers 404 to the rest.
- **The database** is Neon's, in Singapore: each query from Mumbai takes about 70 ms there and back, so a request is
  some tenths of a second slower than next to it.
- **Memory:** idle, the api and the worker take about 400 MB between them and the console about 200 MB (measured
  2026-10-28). `setup.sh` adds 4 GB of swap for heavier moments.
- **Builds:** neither server builds. The api's image is built for linux/amd64 elsewhere and loaded onto each server:
  by GitHub Actions on every merge ("Releases from GitHub Actions" below), or by `release.sh --build-here` on the Mac.
- **Migrations:** neither server holds `DATABASE_MIGRATOR_URL`, so deploys run none. GitHub Actions applies a
  release's migrations before releasing it; from the Mac, apply them first, as on Render (`docs/serverless.md`).

**Working hours and night bursts.** The api and the console's pages run day and night; the background work runs in
the working hours and in short bursts at night, so Neon's free compute hours last the month. The next section says why,
what each choice costs and how to change it.

**No demo rebuild:** the server's console is given no `DEMO_*` settings (`docker-compose.server.yml`), so the demo
agency Render's console rebuilt each night is left as it is.

### The first setup, once

1. **Oracle:** in the servers' subnet's default security list, add ingress rules for TCP 80 and 443 from `0.0.0.0/0`.
2. **Each server, from the Mac** (`<ip>` is the server's public address; the console's role is `console`):

       SERVER=ubuntu@<ip> scripts/server/release.sh --push-only
       ssh -t -i ~/.ssh/travel-crm-oracle ubuntu@<ip> \
         sudo /srv/travel-crm/app/scripts/server/setup.sh --managed-database   # then sudo reboot
       ssh -t -i ~/.ssh/travel-crm-oracle ubuntu@<ip> \
         sudo /srv/travel-crm/app/scripts/server/secrets.sh init <ip>.sslip.io <owner email> api

3. **The owner, in their own terminal,** so no value passes through a chat:
   `ssh -t -i ~/.ssh/travel-crm-oracle ubuntu@<ip> sudo /srv/travel-crm/app/scripts/server/secrets.sh set <NAME>` for:
   - `APP_URL`: the Vercel address;
   - `DATABASE_URL`: Neon's `app_runtime`, through its pooler; on the console's server also `DATABASE_PLATFORM_URL`
     (`app_platform`), and on the api's server never;
   - `DATABASE_POOL_SIZE` `5`, `DATABASE_TRANSACTION_MAX_WAIT_MS` `20000` and `DATABASE_TRANSACTION_TIMEOUT_MS`
     `30000`, since Neon wakes from sleep and is far away;
   - the Render group's values, so nobody notices the move:
     - `BETTER_AUTH_SECRET` (or everyone signs in again);
     - `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` (or every browser's push subscription is lost);
     - `SHEETS_HASH_KEY` (every process refuses to start on a different one);
     - the `S3_*` ones, `SMTP_USER`, `SMTP_PASSWORD` and `EMAIL_FROM_ADDRESS`;
     - on the api's server, `GOOGLE_SHEETS_SERVICE_ACCOUNTS`.

     `init` made its own secret, VAPID pair and Sheets key; setting these replaces them.

   Then `sudo /srv/travel-crm/app/scripts/server/secrets.sh check` says every setting is filled.

4. **The first release:** the migrations from the Mac as on Render, then, from the Mac, the api's server and then the
   console's (the second only loads the image):

       SERVER=ubuntu@<api ip> scripts/server/release.sh --build-here
       SERVER=ubuntu@<console ip> scripts/server/release.sh --build-here

5. **The working hours,** on each server:
   `ssh -t -i ~/.ssh/travel-crm-oracle ubuntu@<ip> sudo /srv/travel-crm/app/scripts/server/work-hours.sh set 09:00 19:00`.
   The night bursts start with their defaults ("Working hours and night bursts" below).
6. **The switch:**
   - In Vercel, set `API_ORIGIN` = `https://<api ip>.sslip.io` and `CONSOLE_ORIGIN` = `https://<console ip>.sslip.io`.
   - Redeploy, and run `docs/serverless.md` step 7's checks.
   - Then suspend the two Render services and the cron-job.org wake-ups (step 9), which nothing needs any more.

### Releases from GitHub Actions

Once it's turned on, every merge to main is released by `.github/workflows/deploy.yml`, on GitHub's runners (free for
a public repository). It runs `scripts/server/release-servers.sh`: it builds the api's image once, applies the
commit's migrations to Neon with that image's `migrate` (when the `DATABASE_MIGRATOR_URL` secret is set), then
releases to the api's server and then the console's, and stops at the first failure. Releases never overlap, and none
is cut short.

**Turning it on, once:**

1. **A deploy key of its own**, never the owner's personal one. On the Mac:
   `ssh-keygen -t ed25519 -N '' -C travel-crm-github-deploy -f ~/.ssh/travel-crm-github-deploy`. Then add its public
   half to both servers:

       for ip in <api ip> <console ip>; do
         ssh -i ~/.ssh/travel-crm-oracle ubuntu@$ip 'cat >> ~/.ssh/authorized_keys' < ~/.ssh/travel-crm-github-deploy.pub
       done

   The key reaches `ubuntu`, which can `sudo`, so whoever holds it holds the servers; that's why it lives only in the
   `production` environment, and why that environment can ask for an approval.

2. **The servers' host keys**, so the runner trusts only them: `ssh-keyscan -t ed25519 <api ip> <console ip>`, and
   check each line's key against the Mac's (`ssh-keygen -F <ip>`).
3. **In GitHub** (Settings → Environments → New environment, named `production`; optionally a required reviewer, the
   owner), as the environment's secrets:
   - `ORACLE_DEPLOY_SSH_KEY`: the private half, `~/.ssh/travel-crm-github-deploy`, whole;
   - `DATABASE_MIGRATOR_URL`: Neon's `app_migrator` connection string, the direct one (not `-pooler`), the same the Mac
     migrates with. Without it the run applies no migrations, and they must be applied first from the Mac.
4. **Repository variables** (Settings → Secrets and variables → Actions → Variables):
   - `ORACLE_API_SERVER` = `ubuntu@<api ip>` and `ORACLE_CONSOLE_SERVER` = `ubuntu@<console ip>`;
   - `ORACLE_KNOWN_HOSTS`: step 2's two lines;
   - `ORACLE_DEPLOY_ENABLED` = `true`, last. Without it the workflow does nothing, so a fork or a fresh clone releases
     nothing.
5. **Render:** once the servers serve the pilot, turn off the two Render services' auto-deploy (or suspend them), or
   every merge also deploys there.

**By hand:** Actions → "Deploy to Oracle" → Run workflow, with a commit, branch or tag; a rollback is the commit
before, whose image the servers keep. A run in progress shows the build, the migrations and each server's
`deploy.sh` and smoke check; the database's host is masked in the log, which is public.

### Day to day

- **Release:**
  - With GitHub Actions on: merge. Without it: migrations first, from the Mac, if the release has any, then
    `release.sh --build-here` to the api's server, then the console's (or `release-servers.sh`, which does all three,
    with `API_SERVER`, `CONSOLE_SERVER` and, to migrate, `DATABASE_MIGRATOR_URL` set).
  - A rollback is a release of the commit before. The servers keep its image.
- **The hours and the bursts:** `work-hours.sh status` on each server, and "Working hours and night bursts" below to
  change them.
- **Unchanged from Render:** behind Vercel, the client address the api sees is Vercel's, so sign-ins share one limit
  and the website form's per-address limits don't apply ("One sign-in limit for everyone" in `docs/serverless.md`).

### Working hours and night bursts

`scripts/server/work-hours.sh` decides when the background work runs, on both servers (decided 2026-10-28).

**Why.** Neon's free plan gives 100 compute hours a month and puts the database to sleep only after **5 minutes with no
query at all**. It charges for the time it's awake, not for queries. While the worker or the console runs its jobs,
pg-boss asks the database something every few seconds (the table below), so Neon never sleeps: around the clock that's
744 hours at Neon's smallest size (0.25 compute units), about **186 compute hours**, and Neon would switch the database
off until the 1st about halfway through the month. Asking less often doesn't help unless every gap is longer than 5
minutes, and pg-boss's own checks can't be spaced that far (its scheduler's are 45 seconds at most). So the work
**stops** at night, apart from short bursts. The api, and the console with its jobs off, ask nothing while nobody uses
them, so they run day and night; a visit at night wakes Neon in about a second, and it sleeps 5 minutes later.

**What runs when** (India time; `work-hours.sh status` shows the plan, the state now and the next timers):

| On the server of | Working hours (09:00 to 19:00) | Night                          | Each night burst (22:00, 01:00, 04:00, 07:00; 10 minutes) |
| ---------------- | ------------------------------ | ------------------------------ | --------------------------------------------------------- |
| the api          | the api and the worker         | the api alone (worker stopped) | the api and the worker                                    |
| the console      | the console with its jobs      | the console's pages, jobs off  | the console with its jobs                                 |

- **What waits for the next burst** (at most 3 hours; after the 07:00 burst, the 09:00 start): what listeners do after a
  change (an invite's email, notifications' email and push, the unassigned-lead alert, each step of an import, an export
  or a Sheets check), the console's jobs (a purge, an export, an erasure), and each schedule's run for the time it
  missed, sent once when its process starts (the subscriptions' records, the sweeps and purges, the inbox's due work).
- **Not affected:** sign-in, every screen's reads and writes (the console's too), the bell's rows and a password reset's
  email, which happen in the request.
- **A long piece of work** may need more than one burst: a burst does what 10 minutes allow. When it ends, a job still
  running gets 2 minutes to finish (`stop_grace_period` in `docker-compose.server.yml`; the processes wait as long
  because `JOBS_POLLING_SECONDS` is set); one cut short runs again later, as pg-boss retries it, and every job is safe
  to run twice.
- **Mechanics:** systemd timers written from `/etc/travel-crm/work-hours`: `travel-crm-work-start.timer` and
  `-stop.timer` at the hours' ends, `-burst.timer` at the bursts (its service runs for the burst's minutes, then puts the
  night back), and `travel-crm-work-hours.service` at boot. The console's mode is in `/etc/travel-crm/console-jobs`,
  which `compose.sh` hands to it as `CONSOLE_JOBS`, so any `compose.sh up` keeps it; changing it recreates the
  console's container, so its pages are away for the half minute it takes to start, at each switch. Each deploy ends
  with `work-hours.sh apply`, which rewrites the timers for the release's script and puts each process in the state the
  time calls for.

**The checks the database sees** while nobody uses the product (`apps/api/src/job-polling.ts`; before is with
`JOBS_POLLING_SECONDS=120` alone, now is with the housekeeping it also brings):

| Check (each process that works jobs)                                  | pg-boss's own | Before       | Now                      |
| --------------------------------------------------------------------- | ------------- | ------------ | ------------------------ |
| Each queue: "a new job?" (the worker about 40 queues, the console 15) | 2 s           | 2 min        | 2 min                    |
| The outbox: "new events to hand out?" (the worker)                    | 1 s           | 2 min        | 2 min                    |
| Scheduled jobs due to be sent?                                        | 5 s           | 45 s         | 45 s (pg-boss's longest) |
| The schedules' watchdog                                               | 30 s          | 30 s         | 45 s (pg-boss's longest) |
| Flows to advance (jobs waiting on jobs; none are used)                | 5 s           | 5 s          | 1 hour                   |
| Supervision (expired jobs to retry, old ones deleted), queue stats    | 1 min each    | 1 min each   | 5 min each               |
| The cache of queues                                                   | 1 min         | 1 min        | 10 min                   |
| The instance registry's heartbeat (monitoring only)                   | 30 s          | 30 s         | 5 min                    |
| Schedules due every minute (the inbox's, the Sheets and Meta checks)  |               | every minute | every minute (a feature) |

Measured idle on a local Postgres 18 on 2026-10-28, in transactions a minute (net of the database's own):

| Process                              | Before | Now                                                      |
| ------------------------------------ | ------ | -------------------------------------------------------- |
| the worker                           | 90     | 37                                                       |
| the console with its jobs            | 71     | 20                                                       |
| the console with its jobs off        |        | 0                                                        |
| the api (and any send-only instance) | 2      | 0 (it stays out of the registry, whose heartbeat it was) |

So by day Neon is awake anyway (the worker asks something every second or two), and what lets it sleep at night is
that the api and the console's pages ask nothing: any check at all, however rare, keeps it awake if it comes more
often than every 5 minutes. The every-minute schedules are features (a snoozed conversation comes back on time, a
sheet's new rows arrive within minutes), so they stay.

**Neon's budget** (compute hours a month at 0.25 compute units; a burst keeps Neon awake its minutes plus the 5 after):

| Choice                                            | Day work | Night bursts | Backups | Total (of 100)  |
| ------------------------------------------------- | -------- | ------------ | ------- | --------------- |
| **Today:** 09:00 to 19:00, 4 bursts of 10 minutes | ~78      | ~8           | ~3      | **~89**         |
| Bursts every 2 hours (6 of 10 minutes)            | ~78      | ~12          | ~3      | ~93: too tight  |
| 08:00 to 20:00, 4 bursts                          | ~93      | ~8           | ~3      | ~104: over      |
| No bursts (the work waits for the morning)        | ~78      | 0            | ~3      | ~81             |
| Everything around the clock, on Neon's free plan  | ~186     |              |         | stops mid-month |

Night visits add a little on top (each wakes Neon for about 5 minutes), and a busy day can take Neon above its
smallest size, which counts for more. Around the clock on Neon's Launch plan costs about $20 a month (~186 compute
hours at $0.106, no monthly minimum; check neon.com/pricing): then `work-hours.sh off` on both servers.

**How Neon is doing:** in Neon's console, the project's **Monitoring** page shows when the compute was active or idle
(idle overnight between bursts is what we want), and **Billing** (or the project's **Usage**) shows the month's compute
hours so far. Mid-month, about half of 89 is on track.

**Changing it,** on each server, as `ubuntu`, with
`ssh -t -i ~/.ssh/travel-crm-oracle ubuntu@<ip> sudo /srv/travel-crm/app/scripts/server/work-hours.sh <command>`:

| Command                             | Does                                                                      |
| ----------------------------------- | ------------------------------------------------------------------------- |
| `status`                            | the plan, what runs now, and the timers' next runs                        |
| `set 09:00 19:00`                   | the working hours (start before end, within one day); bursts stay as set  |
| `bursts 22:00,01:00,04:00,07:00 10` | the night bursts: when, and for how many minutes (1 to 120)               |
| `bursts off`                        | no night bursts: the night's work waits for the morning                   |
| `off`                               | no working hours: everything runs all day and night (Neon's paid plan)    |
| `apply`                             | rewrites the timers and puts the state the time calls for (deploys do it) |

Run the same command on both servers, or the console's jobs and the worker keep different hours. Every burst must fall
outside the working hours: to widen the hours past a burst, move the bursts first. What the timers did:
`journalctl -u travel-crm-work-start -u travel-crm-work-stop -u travel-crm-work-burst`.

## Switch to a real domain

1. **DNS:** point an `A` record (for example `app.<domain>`) at the server's IP, as DNS only (not proxied).
2. **Settings and certificate:**
   - `sudo scripts/server/secrets.sh set APP_HOST` to the new name. This is the one setting the switch needs. The web
     image holds no address, so nothing is rebuilt.
   - Then `sudo scripts/server/compose.sh up --detach --wait`. Caddy gets the new certificate, and the api, worker and
     console take the new address.
3. **R2's CORS rule:** add the new origin, and later remove the old one.
4. **Brevo:** authenticate the domain (its SPF, DKIM and DMARC records), then
   `secrets.sh set EMAIL_FROM_ADDRESS` to an address on it.
5. **Check and tell people:**
   - Run `scripts/server/smoke.sh https://app.<domain>`, and move the uptime monitor to the new address.
   - Tell the pilot agency. Everyone signs in again, and share links and emails sent before the switch point at the
     old address.

## What to watch

- **Uptime:** the monitor's alerts on `/health`.
- **Backups:** the heartbeat or the backup's log (above). Run the restore drill every quarter.
- **Oracle reclaiming the server:** Oracle reclaims an Always Free server whose CPU, network and memory all stay
  under 20% for a week.
  - The product alone uses under 1 GB. Postgres's huge pages, a quarter of the memory, bring the total to about 35%
    to 45%, and memory is what keeps the server safe.
  - Check the instance's **Metrics → Memory utilization** weekly in the first month.
  - A deploy that warns "Postgres runs without huge pages" needs fixing at once (`setup.sh` reserves them).
- **Disk:** check `df -h /` and `sudo docker system df`. Deploys keep two releases' images and two weeks of build
  cache.
- **Logs:** `compose.sh logs`, or the section below. The processes log ids, codes, counts and timings, never a person's data. Caddy keeps no access log.
- **Certificates:** Caddy renews them itself, and `ACME_EMAIL` gets warnings.
- **Quotas:**
  - R2's free 10 GB, in the Cloudflare dashboard;
  - Brevo's 300 emails a day, and its bounces and blocks, in Brevo's dashboard.
- **Security updates:** they install themselves, and a reboot happens at 03:30 India time when one is needed. Their
  log is `/var/log/unattended-upgrades/`.

## Reading logs

Every process (api, worker, console) writes one JSON object per line to standard output (ADR 0032): `level`, `time`,
`process`, `msg`, and fields such as `requestId`, `route`, `status`, `durationMs`, `organizationId`, `userId`, `queue`,
`jobId`, `errorName`, `errorCode` and `errorStack`. Never a name, phone, email, message text, search text, request
body, query string, cookie or token. `LOG_LEVEL` (`info` unless set) is the least important line written.

- **A request's whole story:** every line of a request carries its `requestId`, which the response also sends in
  `x-request-id`. Ask for it (a screenshot of the network tab, or the header), then search for it: the request line,
  the error line with its stack frames, and Better Auth's line share it.
- **On Render:** open the service, **Logs**. Free (Hobby) keeps 7 days. Search for `"level":"error"` (or `warn`) to
  see problems only, `"msg":"request"` for requests, `"route":"/api/trpc"` plus a procedure name in `procedures` for
  one call, `"msg":"job failed"` for the worker, `"msg":"sheet check"` for a Google Sheet's checks, and `"requestId":"…"`
  for one request. For a quiet service, `LOG_LEVEL=debug` adds health checks and each job's start; set it back after.
- **In Axiom** (after "Turn on Axiom"): open the `travel-crm` dataset, **Query**, and filter on the same fields, for
  30 days: `['travel-crm'] | where level == "error" | sort by _time desc`, or `where requestId == "…"`. A **Monitor**
  on `level == "error"` emails when errors appear.
- **Errors never show their message** (it can quote an email address): look at `errorName`, `errorCode` (Postgres's,
  Prisma's, Node's) and `errorStack`.
- **Vercel's logs** (the web app) are separate: Hobby keeps an hour and has no drains. The web app logs nothing of its
  own to look at yet.

## Turn on Axiom

Axiom's free Personal plan keeps 30 days of logs and searches them, and Render's free log tab keeps 7. Shipping is
optional: without the two settings below the lines go to standard output only.

1. In Axiom, create a dataset named `travel-crm`, then an API token that can **only ingest** into it (Settings, API
   tokens, with the dataset and the ingest permission). A token that can query or delete is more than this needs.
2. Set `AXIOM_TOKEN` (a secret) and `AXIOM_DATASET` (`travel-crm`) on all three processes:
   - On Render: the shared environment group the api, worker and console read, or each service's Environment; save
     and let them redeploy. The EU region also sets `AXIOM_URL=https://api.eu.axiom.co`.
   - On the server: `sudo scripts/server/secrets.sh set AXIOM_TOKEN` and `set AXIOM_DATASET`, then
     `scripts/server/release.sh`.
3. Check: the next start-up writes `api starting` (with the version, `NODE_ENV` and log level) and it appears in the
   dataset within seconds. Lines are sent from a thread of their own in batches, and a stopping process sends what is
   queued first, so a redeploy's last lines arrive too. If Axiom can't be reached the process says once, on stderr,
   how many lines it dropped, and carries on: standard output stays the log of record.
4. To turn it off, remove the two settings.

## Turn on Google Sheets

The sync is off until the server holds a service account (the checklist's "Google Sheets" has the Google Cloud steps).

1. `secrets.sh init` already made `SHEETS_HASH_KEY` on a server set up after this change. On an older server, make it
   once with `openssl rand -base64 32 | sudo scripts/server/secrets.sh set SHEETS_HASH_KEY` after adding the line
   `SHEETS_HASH_KEY=''` (and `GOOGLE_SHEETS_SERVICE_ACCOUNTS=''`) to `/srv/travel-crm/production.env`. Never change it.
2. Set the accounts from the key file: `base64 -w0 key.json | sudo scripts/server/secrets.sh set
GOOGLE_SHEETS_SERVICE_ACCOUNTS`, from a terminal of your own so the key doesn't pass through a chat. Keep the
   private key's newlines as the file has them; a key pasted with `\n` typed for its newlines is refused at start-up.
3. Release again (`scripts/server/release.sh`). The api's and the worker's log say `Google Sheets: 1 service account`;
   the console's does not and never holds the accounts.

## Before the next agency

- **Turn two-factor sign-in on** (the owner, 2026-10-18), platform staff included: `features.twoFactor` in
  `packages/contracts`. First check the stored rows, as CLAUDE.md says.
- **A real domain**, with Brevo's domain authentication, so invites and resets stop landing in spam.
- **Files:** the files bucket has no copy. The owner accepts that risk in writing, or adds a copy of the bucket (the
  checklist's "Backups").
- **Retention:** the owner writes down how long backups are kept (now 14 days) in the checklist.
- **Legal:** a privacy policy, a data processing agreement and breach-response steps (the checklist's last item).
- **Errors and staging:** error reporting (Sentry), and a staging copy for testing releases before they go live.

## The first setup, once

What the owner does in the dashboards:

1. **Oracle:**
   - Sign up with home region Mumbai.
   - Create the instance: Ubuntu 24.04, `VM.Standard.A1.Flex` with 2 cores and 12 GB (or 1 and 6 when Mumbai is
     out of capacity), a public IPv4 address, the SSH public key, and a 100 GB boot volume.
   - Open TCP 80 and 443 in the subnet's default security list.
   - Give the boot volume a weekly backup policy that keeps at most 4 backups (5 are free).
2. **Cloudflare R2:**
   - Create two private buckets with an Asia-Pacific location hint: `travel-crm-files` and `travel-crm-backups`.
   - Give each an "Object Read & Write" API token scoped to it alone.
   - On `travel-crm-files`, add a CORS rule: origin `https://<APP_HOST>`, methods `PUT` and `GET`, headers
     `content-type` and `if-none-match`.
   - On `travel-crm-backups`, add a lifecycle rule that deletes objects after 14 days.
3. **Brevo:** an account, a verified sender, and an SMTP key.
4. **An uptime monitor** on `https://<APP_HOST>/health`.

What the deploy agent does, from the Mac:

    SERVER=ubuntu@<ip> scripts/server/release.sh --push-only
    ssh -t -i ~/.ssh/travel-crm-oracle ubuntu@<ip> sudo /srv/travel-crm/app/scripts/server/setup.sh   # then reboot
    ssh -t -i ~/.ssh/travel-crm-oracle ubuntu@<ip> \
      sudo /srv/travel-crm/app/scripts/server/secrets.sh init <ip>.sslip.io <owner email>
    # the owner, in their own terminal, so the keys never pass through a chat:
    ssh -t -i ~/.ssh/travel-crm-oracle ubuntu@<ip> sudo /srv/travel-crm/app/scripts/server/secrets.sh fill
    SERVER=ubuntu@<ip> scripts/server/release.sh
    # the owner, in their own terminal (it prints a temporary password, to change at first sign-in):
    ssh -t -i ~/.ssh/travel-crm-oracle ubuntu@<ip> sudo /srv/travel-crm/app/scripts/server/compose.sh run --rm \
      --no-deps console first-super-admin --email <address> --name "<name>"

Then run a backup, the restore drill, and a test invite and password reset to Gmail.

## Log

| Date | What | Result |
| ---- | ---- | ------ |

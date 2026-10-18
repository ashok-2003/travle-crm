# Runbook: the pilot server

How the product runs for the pilot, and what to do when something has to change or goes wrong. The deploy checklist
(`docs/deploy-checklist.md`) says what any deploy must get right. This page is about this one server.

## What runs where

- **The server:** Oracle Cloud Always Free in Mumbai (`ap-mumbai-1`). It's a `VM.Standard.A1.Flex` with 2 ARM cores
  and 12 GB, running Ubuntu 24.04, with a 100 GB boot volume.
  - Reach it with `ssh -i ~/.ssh/travel-crm-oracle ubuntu@<ip>`. The key is on the owner's Mac.
  - SSH takes keys only. Only 22, 80 and 443 are open, in Oracle's security list and the server's own firewall.
- **The address:** `https://<ip>.sslip.io` until a real domain comes. It's `APP_HOST` in the server's settings.
- **The product:** `docker-compose.server.yml`, run as the Compose project `travel-crm` through
  `scripts/server/compose.sh`:
  - Postgres 18, never published outside the server;
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

| Secret                                                                       | How                                                                                                                                                                                                                    | What it costs           |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| `BETTER_AUTH_SECRET`                                                         | `openssl rand -base64 32 \| sudo scripts/server/secrets.sh set BETTER_AUTH_SECRET`                                                                                                                                     | everyone signs in again |
| A database role's password (`RUNTIME_`, `PLATFORM_`, `MIGRATOR_DB_PASSWORD`) | pick `NEW=$(openssl rand -hex 32)`, run `ALTER ROLE app_runtime PASSWORD '<new>'` through `compose.sh exec -T postgres psql -U postgres`, then `echo "$NEW" \| sudo scripts/server/secrets.sh set RUNTIME_DB_PASSWORD` | a restart               |
| R2 tokens, Brevo's SMTP key                                                  | make the new one in its dashboard, `secrets.sh set` it, restart, then revoke the old one                                                                                                                               | a restart               |
| The VAPID pair                                                               | never, unless it leaked: a new pair silently drops every browser's push subscription                                                                                                                                   | every subscription      |
| The backup key                                                               | make a new one with `age-keygen`, then `secrets.sh set BACKUP_AGE_RECIPIENT` to its public key. Keep the old private key until the old backups expire, 14 days later.                                                  | nothing                 |
| The SSH key                                                                  | add the new public key to `~/.ssh/authorized_keys` on the server, check that it works, then remove the old one                                                                                                         | nothing                 |

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
  - The product alone uses about 6% of the memory. Postgres's 3 GB of huge pages bring it to about 35%, and memory
    is what keeps the server safe.
  - Check the instance's **Metrics → Memory utilization** weekly in the first month.
  - A deploy that warns "Postgres runs without huge pages" needs fixing at once (`setup.sh` reserves them).
- **Disk:** check `df -h /` and `sudo docker system df`. Deploys keep two releases' images and two weeks of build
  cache.
- **Logs:** `compose.sh logs`. The processes log ids and codes, never a person's data. Caddy keeps no access log.
- **Certificates:** Caddy renews them itself, and `ACME_EMAIL` gets warnings.
- **Quotas:**
  - R2's free 10 GB, in the Cloudflare dashboard;
  - Brevo's 300 emails a day, and its bounces and blocks, in Brevo's dashboard.
- **Security updates:** they install themselves, and a reboot happens at 03:30 India time when one is needed. Their
  log is `/var/log/unattended-upgrades/`.

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
   - Create the instance: Ubuntu 24.04, `VM.Standard.A1.Flex` with 2 cores and 12 GB, a public IPv4 address, the SSH
     public key, and a 100 GB boot volume.
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

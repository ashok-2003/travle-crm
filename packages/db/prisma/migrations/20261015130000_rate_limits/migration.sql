-- CreateTable
CREATE TABLE "rate_limit_counter" (
    "key" TEXT NOT NULL,
    "window_start" TIMESTAMPTZ(6) NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "rate_limit_counter_pkey" PRIMARY KEY ("key","window_start")
);

-- CreateIndex
CREATE INDEX "rate_limit_counter_window_start_idx" ON "rate_limit_counter"("window_start");


-- ---------------------------------------------------------------------------
-- Hand-written (Prisma does not model these). Keep below the generated SQL.
-- ---------------------------------------------------------------------------

-- Keys are keyed hashes (HMAC-SHA256) in hex, so the table never holds the IP addresses they were made from; counts
-- start at 1.
ALTER TABLE "rate_limit_counter"
  ADD CONSTRAINT rate_limit_counter_key_hash CHECK (key ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT rate_limit_counter_count_positive CHECK (count > 0);

-- The runtime role counts hits (the upsert's UPDATE) and deletes finished windows, but may change nothing but count.
-- Only the api and worker use this table: the platform role has no business with it.
REVOKE UPDATE ON TABLE "rate_limit_counter" FROM app_runtime;
GRANT UPDATE (count) ON TABLE "rate_limit_counter" TO app_runtime;
REVOKE ALL ON TABLE "rate_limit_counter" FROM app_platform;

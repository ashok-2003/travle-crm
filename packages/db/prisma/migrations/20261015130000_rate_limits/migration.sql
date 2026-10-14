-- CreateTable
CREATE TABLE "rate_limit_counter" (
    "key" TEXT NOT NULL,
    "window_start" TIMESTAMPTZ(6) NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "rate_limit_counter_pkey" PRIMARY KEY ("key","window_start")
);


-- ---------------------------------------------------------------------------
-- Hand-written (Prisma does not model these). Keep below the generated SQL.
-- ---------------------------------------------------------------------------

-- Keys are sha256 hashes in hex, so the table never holds the IP addresses they were made from; counts start at 1.
ALTER TABLE "rate_limit_counter"
  ADD CONSTRAINT rate_limit_counter_key_hash CHECK (key ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT rate_limit_counter_count_positive CHECK (count > 0);

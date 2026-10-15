-- CreateTable
CREATE TABLE "processed_event" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "listener" TEXT NOT NULL,
    "event_id" UUID NOT NULL,
    "processed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_event_pkey" PRIMARY KEY ("organization_id","listener","event_id")
);


-- ---------------------------------------------------------------------------
-- Hand-written (Prisma does not model these). Keep below the generated SQL.
-- ---------------------------------------------------------------------------

-- Organization isolation (see app_enable_org_rls in the init migration).
SELECT app_enable_org_rls('processed_event');

-- A record that a listener handled an event is a fact: the api and worker add them and never change or remove one.
REVOKE UPDATE, DELETE ON TABLE "processed_event" FROM app_runtime;

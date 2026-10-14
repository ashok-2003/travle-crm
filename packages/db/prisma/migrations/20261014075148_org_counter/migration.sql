-- CreateTable
CREATE TABLE "org_counter" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL,

    CONSTRAINT "org_counter_pkey" PRIMARY KEY ("organization_id","key")
);

-- AddForeignKey
ALTER TABLE "org_counter" ADD CONSTRAINT "org_counter_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Organization isolation (see the app_enable_org_rls function in the init migration).
SELECT app_enable_org_rls('org_counter');

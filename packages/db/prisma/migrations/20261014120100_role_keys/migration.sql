-- DropIndex
DROP INDEX "role_organization_id_key_key";

-- AlterTable
ALTER TABLE "role_permission" DROP CONSTRAINT "role_permission_pkey",
ADD CONSTRAINT "role_permission_pkey" PRIMARY KEY ("organization_id", "role_id", "permission");

-- CreateIndex
CREATE UNIQUE INDEX "role_organization_id_key_key" ON "role"("organization_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "role_organization_id_name_key" ON "role"("organization_id", "name") WHERE ("deleted_at" IS NULL);


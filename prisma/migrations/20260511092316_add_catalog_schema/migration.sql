/*
  Warnings:

  - You are about to drop the column `folder_id` on the `features` table. All the data in the column will be lost.
  - You are about to drop the column `geometry` on the `features` table. All the data in the column will be lost.
  - You are about to drop the column `aggregate_type` on the `outbox_dlq` table. All the data in the column will be lost.
  - You are about to drop the column `correlation_id` on the `outbox_dlq` table. All the data in the column will be lost.
  - You are about to drop the column `moved_at` on the `outbox_dlq` table. All the data in the column will be lost.
  - You are about to drop the column `original_created_at` on the `outbox_dlq` table. All the data in the column will be lost.
  - You are about to drop the column `snapshot_geometry` on the `versions` table. All the data in the column will be lost.
  - You are about to drop the `location_points` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[parent_id,name]` on the table `folders` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "catalog"."export_jobs" DROP CONSTRAINT "export_jobs_folder_id_fkey";

-- DropForeignKey
ALTER TABLE "catalog"."export_jobs" DROP CONSTRAINT "export_jobs_owner_id_fkey";

-- DropForeignKey
ALTER TABLE "catalog"."folders" DROP CONSTRAINT "folders_owner_id_fkey";

-- DropForeignKey
ALTER TABLE "catalog"."folders" DROP CONSTRAINT "folders_parent_id_fkey";

-- DropForeignKey
ALTER TABLE "catalog"."import_jobs" DROP CONSTRAINT "import_jobs_folder_id_fkey";

-- DropForeignKey
ALTER TABLE "catalog"."import_jobs" DROP CONSTRAINT "import_jobs_owner_id_fkey";

-- DropForeignKey
ALTER TABLE "geometry"."features" DROP CONSTRAINT "features_folder_id_fkey";

-- DropIndex
DROP INDEX "catalog"."idx_folders_path";

-- DropIndex
DROP INDEX "geometry"."features_geometry_idx";

-- DropIndex
DROP INDEX "infrastructure"."idx_outbox_dlq_event_type";

-- DropIndex
DROP INDEX "infrastructure"."idx_outbox_dlq_moved";

-- DropIndex
DROP INDEX "versioning"."versions_snapshot_geometry_idx";

-- AlterTable
ALTER TABLE "geometry"."features" DROP COLUMN "folder_id",
DROP COLUMN "geometry";

-- AlterTable
ALTER TABLE "identity"."refresh_tokens" ALTER COLUMN "family_id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "infrastructure"."outbox" ALTER COLUMN "max_retries" SET DEFAULT 3;

-- AlterTable
ALTER TABLE "infrastructure"."outbox_dlq" DROP COLUMN "aggregate_type",
DROP COLUMN "correlation_id",
DROP COLUMN "moved_at",
DROP COLUMN "original_created_at",
ADD COLUMN     "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "versioning"."versions" DROP COLUMN "snapshot_geometry";

-- DropTable
DROP TABLE "tracking"."location_points";

-- CreateIndex
CREATE INDEX "folders_parent_id_idx" ON "catalog"."folders"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "folders_parent_id_name_key" ON "catalog"."folders"("parent_id", "name");

-- AddForeignKey
ALTER TABLE "catalog"."folders" ADD CONSTRAINT "folders_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "catalog"."folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog"."import_jobs" ADD CONSTRAINT "import_jobs_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "catalog"."folders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog"."export_jobs" ADD CONSTRAINT "export_jobs_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "catalog"."folders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "catalog"."idx_export_jobs_folder" RENAME TO "export_jobs_folder_id_idx";

-- RenameIndex
ALTER INDEX "catalog"."idx_export_jobs_owner" RENAME TO "export_jobs_owner_id_idx";

-- RenameIndex
ALTER INDEX "catalog"."idx_export_jobs_status" RENAME TO "export_jobs_status_idx";

-- RenameIndex
ALTER INDEX "catalog"."idx_folders_level" RENAME TO "folders_level_idx";

-- RenameIndex
ALTER INDEX "catalog"."idx_folders_owner" RENAME TO "folders_owner_id_idx";

-- RenameIndex
ALTER INDEX "catalog"."idx_folders_sort" RENAME TO "folders_parent_id_sort_order_idx";

-- RenameIndex
ALTER INDEX "catalog"."idx_import_jobs_folder" RENAME TO "import_jobs_folder_id_idx";

-- RenameIndex
ALTER INDEX "catalog"."idx_import_jobs_owner" RENAME TO "import_jobs_owner_id_idx";

-- RenameIndex
ALTER INDEX "catalog"."idx_import_jobs_status" RENAME TO "import_jobs_status_idx";

-- RenameIndex
ALTER INDEX "identity"."RefreshToken_family_id_idx" RENAME TO "refresh_tokens_family_id_idx";

/*
  Warnings:

  - You are about to drop the column `geometry` on the `features` table. All the data in the column will be lost.
  - You are about to drop the column `snapshot_geometry` on the `versions` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "geometry"."features_geometry_idx";

-- DropIndex
DROP INDEX "versioning"."versions_snapshot_geometry_idx";

-- AlterTable
ALTER TABLE "geometry"."features" DROP COLUMN "geometry";

-- AlterTable
ALTER TABLE "versioning"."versions" DROP COLUMN "snapshot_geometry";

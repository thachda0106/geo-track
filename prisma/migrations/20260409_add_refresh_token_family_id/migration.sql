-- AlterTable: Add family_id column to refresh_tokens for token rotation tracking
ALTER TABLE "identity"."refresh_tokens" ADD COLUMN "family_id" UUID NOT NULL DEFAULT gen_random_uuid();

-- CreateIndex: Index on family_id for fast family-based revocation
CREATE INDEX "RefreshToken_family_id_idx" ON "identity"."refresh_tokens"("family_id");

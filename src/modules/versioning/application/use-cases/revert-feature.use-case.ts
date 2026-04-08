import { Injectable, Inject } from '@nestjs/common';
import { NotFoundError } from '@app/core';
import {
  IFeatureVersionRepository,
  FEATURE_VERSION_REPOSITORY,
} from '../../domain/repositories/feature-version.repository';
import { RevertDto } from '../dtos/versioning.dto';
import { PrismaService } from '@app/core'; // temporary import until we extract current feature cross-boundary validation

@Injectable()
export class RevertFeatureUseCase {
  constructor(
    @Inject(FEATURE_VERSION_REPOSITORY)
    private readonly versionRepository: IFeatureVersionRepository,
    private readonly prisma: PrismaService, // Cross Domain dependency (fetching current geometry version)
  ) {}

  async execute(featureId: string, dto: RevertDto, userId: string) {
    // 1. Validate Target Version Exists (Domain)
    const targetVersion = await this.versionRepository.getVersion(
      featureId,
      dto.toVersion,
    );
    if (!targetVersion) {
      throw new NotFoundError('Version', `${featureId}@v${dto.toVersion}`);
    }

    // 2. Validate current Feature existence & retrieve current_version
    // Note: Cross-domain query to geometry.features. Ideally handled by a Geometry Port, but using Prisma directly to preserve behavioral structure.
    const [current] = await this.prisma.$queryRawUnsafe<
      { current_version: number }[]
    >(
      `SELECT current_version FROM geometry.features
      WHERE id = $1::uuid AND is_deleted = FALSE`,
      featureId,
    );

    if (!current) throw new NotFoundError('Feature', featureId);

    const newVersionNumber = current.current_version + 1;

    // 3. Delegate highly-coupled Transaction to Infrastructure
    const revertedVersionEntity =
      await this.versionRepository.executeRevertTransaction({
        featureId,
        targetVersion,
        newVersionNumber,
        userId,
        message: dto.message,
      });

    return {
      versionNumber: revertedVersionEntity.versionNumber,
      featureId: revertedVersionEntity.featureId,
      changeType: revertedVersionEntity.changeType,
      message: revertedVersionEntity.message,
      createdAt: revertedVersionEntity.createdAt,
    };
  }
}

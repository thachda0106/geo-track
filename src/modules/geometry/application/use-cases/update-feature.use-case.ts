import { Injectable, Inject } from '@nestjs/common';
import { UpdateFeatureDto } from '../dtos/geometry.dto';
import { NotFoundError, ConflictError } from '@app/core';
import {
  FEATURE_REPOSITORY,
  IFeatureRepository,
} from '../../domain/repositories/feature.repository';

@Injectable()
export class UpdateFeatureUseCase {
  constructor(
    @Inject(FEATURE_REPOSITORY)
    private readonly featureRepository: IFeatureRepository,
  ) {}

  async execute(id: string, dto: UpdateFeatureDto, userId: string) {
    const feature = await this.featureRepository.findById(id);

    if (!feature) {
      throw new NotFoundError('Feature', id);
    }

    if (feature.getCurrentVersion() !== dto.expectedVersion) {
      throw new ConflictError(
        'Feature',
        feature.getCurrentVersion(),
        dto.expectedVersion,
      );
    }

    // Call domain methods to update
    feature.updateInfo(
      {
        name: dto.name,
        description: dto.description,
        tags: dto.tags,
        properties: dto.properties,
      },
      userId,
    );

    if (dto.geometry) {
      feature.updateGeometry(dto.geometry, userId);
    }

    feature.incrementVersion();

    return this.featureRepository.save(feature);
  }
}

import { Injectable, Inject } from '@nestjs/common';
import { CreateFeatureDto } from '../dtos/geometry.dto';
import { Feature } from '../../domain/entities/feature.entity';
import {
  FEATURE_REPOSITORY,
  IFeatureRepository,
} from '../../domain/repositories/feature.repository';

@Injectable()
export class CreateFeatureUseCase {
  constructor(
    @Inject(FEATURE_REPOSITORY)
    private readonly featureRepository: IFeatureRepository,
  ) {}

  async execute(dto: CreateFeatureDto, userId: string) {
    const feature = Feature.create(dto, userId);
    return this.featureRepository.save(feature);
  }
}

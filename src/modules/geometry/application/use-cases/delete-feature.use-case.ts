import { Injectable, Inject } from '@nestjs/common';
import {
  FEATURE_REPOSITORY,
  IFeatureRepository,
} from '../../domain/repositories/feature.repository';

@Injectable()
export class DeleteFeatureUseCase {
  constructor(
    @Inject(FEATURE_REPOSITORY)
    private readonly featureRepository: IFeatureRepository,
  ) {}

  async execute(id: string, expectedVersion: number, userId: string) {
    // Check constraints via domain repository logic
    await this.featureRepository.delete(id, expectedVersion, userId);
  }
}

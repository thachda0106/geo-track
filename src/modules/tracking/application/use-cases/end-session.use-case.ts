import { Injectable, Inject } from '@nestjs/common';
import { NotFoundError } from '@app/core';
import {
  ITrackingSessionRepository,
  TRACKING_SESSION_REPOSITORY,
} from '../../domain/repositories/tracking-session.repository';

@Injectable()
export class EndSessionUseCase {
  constructor(
    @Inject(TRACKING_SESSION_REPOSITORY)
    private readonly sessionRepository: ITrackingSessionRepository,
  ) {}

  async execute(sessionId: string) {
    // 1. Fetch domain entity
    const session = await this.sessionRepository.findById(sessionId);
    if (!session) throw new NotFoundError('TrackingSession', sessionId);

    // 2. Execute domain logic
    session.endSession();

    // 3. Save state
    await this.sessionRepository.save(session);

    // Here we would dispatch a Domain Event: new SessionEndedEvent(sessionId)
    // using an Outbox or EventBus for decoupled Side Effects

    return {
      id: session.id,
      status: session.status,
      endedAt: session.endedAt,
      totalPoints: Number(session.totalPoints),
      totalDistanceM: session.totalDistanceM,
    };
  }
}

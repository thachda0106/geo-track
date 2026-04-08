import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UsePipes,
} from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from 'nestjs-zod';
import { CommandBus } from '@nestjs/cqrs';
import { IngestLocationCommand } from '../application/commands/ingest-location.command';

const LocationSchema = z.object({
  deviceId: z.string().uuid(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  speed: z.number().nonnegative().optional(),
  timestamp: z.string().datetime(),
});

type LocationDto = z.infer<typeof LocationSchema>;

@Controller('v1/tracking')
export class IngestController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post('ingest')
  @HttpCode(HttpStatus.ACCEPTED) // 202 Accepted - DO NOT BLOCK!
  @UsePipes(new ZodValidationPipe(LocationSchema))
  ingest(@Body() payload: LocationDto): void {
    // Fire and forget via CommandBus to decouple HTTP response from processing
    void this.commandBus.execute(
      new IngestLocationCommand(
        payload.deviceId,
        payload.lat,
        payload.lng,
        payload.timestamp,
        payload.speed,
      ),
    );
  }
}

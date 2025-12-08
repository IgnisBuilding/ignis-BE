import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FireSafetyController } from './fire_safety.controller';
import { FireSafetyService } from './fire_safety.service';
import { IsolationDetectionService } from './isolation-detection.service';
import {
  edges,
  EvacuationRoute,
  nodes,
  rescue_teams,
  trapped_occupants,
  isolation_events,
} from '@app/entities';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      EvacuationRoute,
      nodes,
      edges,
      rescue_teams,
      trapped_occupants,
      isolation_events,
    ]),
  ],
  controllers: [FireSafetyController],
  providers: [FireSafetyService, IsolationDetectionService],
})
export class FireSafetyModule {}

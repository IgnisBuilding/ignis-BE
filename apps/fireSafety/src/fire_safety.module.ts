import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FireSafetyController } from './fire_safety.controller';
import { FireSafetyService } from './fire_safety.service';
import { edges, EvacuationRoute, nodes } from '@app/entities';

@Module({
  imports: [TypeOrmModule.forFeature([EvacuationRoute, nodes, edges])],
  controllers: [FireSafetyController],
  providers: [FireSafetyService],
})
export class FireSafetyModule {}
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FireSafetyController } from './fire_safety.controller';
import { FireSafetyService } from './fire_safety.service';
import { Edge, EvacuationRoute, Node } from '@app/entities';

@Module({
  imports: [TypeOrmModule.forFeature([EvacuationRoute, Node, Edge])],
  controllers: [FireSafetyController],
  providers: [FireSafetyService],
})
export class FireSafetyModule {}
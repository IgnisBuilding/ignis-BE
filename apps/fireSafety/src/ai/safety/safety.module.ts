import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { building, floor, hazards } from '@app/entities';
import { SafetyEngineService } from './safety-engine.service';

@Module({
  imports: [TypeOrmModule.forFeature([hazards, building, floor])],
  providers: [SafetyEngineService],
  exports: [SafetyEngineService],
})
export class SafetyModule {}

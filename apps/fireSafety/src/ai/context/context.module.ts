import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Sensor,
  Society,
  apartment,
  building,
  fire_detection_log,
  floor,
  hazards,
} from '@app/entities';
import { ScopeResolverService } from './scope-resolver.service';
import { ContextBuilderService } from './context-builder.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      building,
      Society,
      apartment,
      floor,
      hazards,
      Sensor,
      fire_detection_log,
    ]),
  ],
  providers: [ScopeResolverService, ContextBuilderService],
  exports: [ScopeResolverService, ContextBuilderService],
})
export class ContextModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { apartment, building, floor, Society } from '@app/entities';
import { ScopeResolverService } from './scope-resolver.service';

@Module({
  imports: [TypeOrmModule.forFeature([building, Society, apartment, floor])],
  providers: [ScopeResolverService],
  exports: [ScopeResolverService],
})
export class ScopeResolverModule {}

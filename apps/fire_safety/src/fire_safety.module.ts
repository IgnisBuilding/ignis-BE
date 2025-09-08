import { Module } from '@nestjs/common';
import { FireSafetyController } from './fire_safety.controller';
import { FireSafetyService } from './fire_safety.service';

@Module({
  imports: [],
  controllers: [FireSafetyController],
  providers: [FireSafetyService],
})
export class FireSafetyModule {}

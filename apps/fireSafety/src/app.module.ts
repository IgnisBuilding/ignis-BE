import { Module } from '@nestjs/common';
import { DatabaseModule } from '@app/database';
import { FireSafetyModule } from './fire_safety.module';

@Module({
  imports: [
    DatabaseModule, // ✅ pulls connection & entities
    FireSafetyModule,
  ],
})
export class AppModule {}
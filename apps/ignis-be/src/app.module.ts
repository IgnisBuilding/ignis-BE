import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from '@app/database';
import { FireSafetyModule } from 'apps/fireSafety/src/fire_safety.module';

@Module({
  imports: [DatabaseModule, FireSafetyModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

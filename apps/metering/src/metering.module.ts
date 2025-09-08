import { Module } from '@nestjs/common';
import { MeteringController } from './metering.controller';
import { MeteringService } from './metering.service';

@Module({
  imports: [],
  controllers: [MeteringController],
  providers: [MeteringService],
})
export class MeteringModule {}

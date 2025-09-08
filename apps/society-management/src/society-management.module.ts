import { Module } from '@nestjs/common';
import { SocietyManagementController } from './society-management.controller';
import { SocietyManagementService } from './society-management.service';

@Module({
  imports: [],
  controllers: [SocietyManagementController],
  providers: [SocietyManagementService],
})
export class SocietyManagementModule {}

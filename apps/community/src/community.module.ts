import { Module } from '@nestjs/common';
import { CommunityController } from './community.controller';
import { CommunityService } from './community.service';

@Module({
  imports: [],
  controllers: [CommunityController],
  providers: [CommunityService],
})
export class CommunityModule {}

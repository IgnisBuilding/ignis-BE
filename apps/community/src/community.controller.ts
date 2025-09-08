import { Controller, Get } from '@nestjs/common';
import { CommunityService } from './community.service';

@Controller()
export class CommunityController {
  constructor(private readonly communityService: CommunityService) {}

  @Get()
  getHello(): string {
    return this.communityService.getHello();
  }
}

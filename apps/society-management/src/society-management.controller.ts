import { Controller, Get } from '@nestjs/common';
import { SocietyManagementService } from './society-management.service';

@Controller()
export class SocietyManagementController {
  constructor(private readonly societyManagementService: SocietyManagementService) {}

  @Get()
  getHello(): string {
    return this.societyManagementService.getHello();
  }
}

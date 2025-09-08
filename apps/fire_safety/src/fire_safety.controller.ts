import { Controller, Get } from '@nestjs/common';
import { FireSafetyService } from './fire_safety.service';

@Controller()
export class FireSafetyController {
  constructor(private readonly fireSafetyService: FireSafetyService) {}

  @Get()
  getHello(): string {
    return this.fireSafetyService.getHello();
  }
}

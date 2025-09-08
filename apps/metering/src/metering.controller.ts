import { Controller, Get } from '@nestjs/common';
import { MeteringService } from './metering.service';

@Controller()
export class MeteringController {
  constructor(private readonly meteringService: MeteringService) {}

  @Get()
  getHello(): string {
    return this.meteringService.getHello();
  }
}

import { Controller, Get, Put, Body, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { SettingsService } from '../services/settings.service';
import { UpdateSettingsDto } from '../dto/settings.dto';

@Controller('settings')
@UseGuards(JwtAuthGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('my')
  async getMy(@Request() req) {
    return this.settingsService.getOrCreate(req.user.userId);
  }

  @Put('my')
  async updateMy(@Request() req, @Body() dto: UpdateSettingsDto) {
    return this.settingsService.update(req.user.userId, dto);
  }
}

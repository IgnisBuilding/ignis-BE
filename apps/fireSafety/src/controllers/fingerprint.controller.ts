import { Controller, Get, Post, Delete, Param, Body, ParseIntPipe } from '@nestjs/common';
import { FingerprintService } from '../services/fingerprint.service';
import { Public } from '../decorators/public.decorator';
import { Fingerprint } from '@app/entities';

@Controller('api')
export class FingerprintController {
  constructor(private fingerprintService: FingerprintService) {}

  @Post('fingerprints/batch')
  @Public()
  async uploadBatch(@Body() fingerprints: Partial<Fingerprint>[]) {
    return this.fingerprintService.uploadBatch(fingerprints);
  }

  @Get('buildings/:id/fingerprints')
  @Public()
  async getByBuilding(@Param('id', ParseIntPipe) buildingId: number) {
    return this.fingerprintService.findByBuilding(buildingId);
  }

  @Delete('fingerprints/:id')
  @Public()
  async delete(@Param('id') id: string) {
    await this.fingerprintService.delete(id);
    return { success: true };
  }
}

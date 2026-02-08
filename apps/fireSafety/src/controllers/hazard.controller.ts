import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { Public } from '../decorators/public.decorator';
import { HazardService } from '../services/hazard.service';
import { CreateHazardDto, UpdateHazardDto } from '../dto/hazard.dto';
import { FireDetectionGateway } from '../gateways/fire-detection.gateway';

@Controller('hazards')
@UseGuards(JwtAuthGuard)
export class HazardController {
  constructor(
    private readonly hazardService: HazardService,
    private readonly fireDetectionGateway: FireDetectionGateway,
  ) {}

  @Get()
  @Public()
  async findAll() {
    return this.hazardService.findAll();
  }

  @Get('active')
  @Public()
  async findActive(@Query('building_id') buildingId?: string) {
    if (buildingId) {
      return this.hazardService.findByBuilding(parseInt(buildingId, 10));
    }
    return this.hazardService.findActive();
  }

  @Get(':id')
  @Public()
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.hazardService.findOne(id);
  }

  @Post()
  @Public()
  async create(@Body() createHazardDto: CreateHazardDto) {
    const hazard = await this.hazardService.create(createHazardDto);
    this.fireDetectionGateway.emitHazardCreated(hazard);
    return hazard;
  }

  @Patch(':id')
  @Public()
  async updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateHazardDto: UpdateHazardDto,
  ) {
    const hazard = await this.hazardService.updateStatus(id, updateHazardDto);
    if (updateHazardDto.status === 'resolved') {
      this.fireDetectionGateway.emitHazardResolved(hazard);
    }
    return hazard;
  }

  @Patch(':id/respond')
  @Public()
  async respond(@Param('id', ParseIntPipe) id: number) {
    return this.hazardService.respond(id);
  }

  @Patch(':id/resolve')
  @Public()
  async resolve(@Param('id', ParseIntPipe) id: number) {
    const hazard = await this.hazardService.resolve(id);
    this.fireDetectionGateway.emitHazardResolved(hazard);
    return hazard;
  }

  @Delete(':id')
  @Public()
  async delete(@Param('id', ParseIntPipe) id: number) {
    const hazard = await this.hazardService.findOne(id);
    await this.hazardService.delete(id);
    this.fireDetectionGateway.emitHazardResolved({ id: hazard.id });
  }
}

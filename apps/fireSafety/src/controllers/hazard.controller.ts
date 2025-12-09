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
} from '@nestjs/common';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { HazardService } from '../services/hazard.service';
import { CreateHazardDto, UpdateHazardDto } from '../dto/hazard.dto';

@Controller('hazards')
@UseGuards(JwtAuthGuard)
export class HazardController {
  constructor(private readonly hazardService: HazardService) {}

  @Get()
  async findAll() {
    return this.hazardService.findAll();
  }

  @Get('active')
  async findActive() {
    return this.hazardService.findActive();
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.hazardService.findOne(id);
  }

  @Post()
  async create(@Body() createHazardDto: CreateHazardDto) {
    return this.hazardService.create(createHazardDto);
  }

  @Patch(':id')
  async updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateHazardDto: UpdateHazardDto,
  ) {
    return this.hazardService.updateStatus(id, updateHazardDto);
  }

  @Patch(':id/respond')
  async respond(@Param('id', ParseIntPipe) id: number) {
    return this.hazardService.respond(id);
  }

  @Patch(':id/resolve')
  async resolve(@Param('id', ParseIntPipe) id: number) {
    return this.hazardService.resolve(id);
  }

  @Delete(':id')
  async delete(@Param('id', ParseIntPipe) id: number) {
    return this.hazardService.delete(id);
  }
}

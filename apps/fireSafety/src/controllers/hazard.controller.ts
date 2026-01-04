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
import { Public } from '../decorators/public.decorator';
import { HazardService } from '../services/hazard.service';
import { CreateHazardDto, UpdateHazardDto } from '../dto/hazard.dto';

@Controller('hazards')
@UseGuards(JwtAuthGuard)
export class HazardController {
  constructor(private readonly hazardService: HazardService) {}

  @Get()
  @Public()
  async findAll() {
    return this.hazardService.findAll();
  }

  @Get('active')
  @Public()
  async findActive() {
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
    return this.hazardService.create(createHazardDto);
  }

  @Patch(':id')
  @Public()
  async updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateHazardDto: UpdateHazardDto,
  ) {
    return this.hazardService.updateStatus(id, updateHazardDto);
  }

  @Patch(':id/respond')
  @Public()
  async respond(@Param('id', ParseIntPipe) id: number) {
    return this.hazardService.respond(id);
  }

  @Patch(':id/resolve')
  @Public()
  async resolve(@Param('id', ParseIntPipe) id: number) {
    return this.hazardService.resolve(id);
  }

  @Delete(':id')
  @Public()
  async delete(@Param('id', ParseIntPipe) id: number) {
    return this.hazardService.delete(id);
  }
}

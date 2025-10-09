import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  ParseIntPipe,
} from '@nestjs/common';
import { FireSafetyService } from './fire_safety.service';
import { CreateRouteDto } from './dto/CreateRoute.dto';

@Controller('fireSafety')
export class FireSafetyController {
  constructor(private readonly fireSafetyService: FireSafetyService) {}

  @Post('compute')
  compute(@Body() createRouteDto: CreateRouteDto) {
    return this.fireSafetyService.computeAndSavePath(createRouteDto);
  }

  @Get()
  findAll() {
    return this.fireSafetyService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.fireSafetyService.findOne(id);
  }

  @Get(':id/geojson')
  getRouteAsGeoJSON(@Param('id', ParseIntPipe) id: number) {
    // First, ensure the route exists. findOne will throw if not found.
    this.fireSafetyService.findOne(id);
    // Then, return the GeoJSON representation.
    return this.fireSafetyService.getRouteAsGeoJSON(id);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.fireSafetyService.remove(id);
  }
}
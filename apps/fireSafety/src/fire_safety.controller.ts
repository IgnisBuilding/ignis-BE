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

  @Get('emergency/exits')
  getEmergencyExits() {
    return {
      building: "Office Tower A",
      floors: 10,
      emergencyExits: [
        {
          exitId: "EXIT-001",
          location: "Ground Floor - North Wing",
          capacity: 150,
          status: "OPERATIONAL",
          coordinates: { lat: 40.7128, lng: -74.0060 }
        },
        {
          exitId: "EXIT-002", 
          location: "Ground Floor - South Wing",
          capacity: 120,
          status: "OPERATIONAL",
          coordinates: { lat: 40.7127, lng: -74.0061 }
        },
        {
          exitId: "EXIT-003",
          location: "First Floor - East Wing", 
          capacity: 80,
          status: "UNDER_MAINTENANCE",
          coordinates: { lat: 40.7129, lng: -74.0059 }
        }
      ],
      totalCapacity: 350,
      lastUpdated: new Date().toISOString()
    };
  }

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
import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
import { SensorService } from '../services/sensor.service';
import { CreateSensorDto, UpdateSensorDto } from '../dto/sensor.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { Public } from '../decorators/public.decorator';

@Controller('sensors')
@UseGuards(JwtAuthGuard)
export class SensorController {
  constructor(private sensorService: SensorService) {}

  @Get()
  @Public()
  findAll(@Query('status') status?: string, @Query('roomId') roomId?: string) {
    if (status) return this.sensorService.findByStatus(status);
    if (roomId) return this.sensorService.findByRoom(parseInt(roomId));
    return this.sensorService.findAll();
  }

  @Get('stats')
  @Public()
  getStats() {
    return this.sensorService.getStats();
  }

  @Get(':id')
  @Public()
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.sensorService.findOne(id);
  }

  @Post()
  create(@Body() createSensorDto: CreateSensorDto) {
    return this.sensorService.create(createSensorDto);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() updateSensorDto: UpdateSensorDto) {
    return this.sensorService.update(id, updateSensorDto);
  }

  @Patch(':id/reading')
  updateReading(@Param('id', ParseIntPipe) id: number, @Body() body: { value: number; status?: string }) {
    return this.sensorService.updateReading(id, body.value, body.status);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.sensorService.remove(id);
  }
}

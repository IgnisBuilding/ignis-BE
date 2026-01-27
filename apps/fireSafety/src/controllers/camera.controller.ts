import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { CameraService } from '../services/camera.service';
import { CreateCameraDto, UpdateCameraDto } from '../dto/camera.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { Public } from '../decorators/public.decorator';

@Controller('cameras')
@UseGuards(JwtAuthGuard)
export class CameraController {
  constructor(private cameraService: CameraService) {}

  @Get()
  @Public()
  findAll(
    @Query('building_id') buildingId?: string,
    @Query('floor_id') floorId?: string,
    @Query('room_id') roomId?: string,
    @Query('status') status?: string,
  ) {
    const filters: any = {};
    if (buildingId) filters.building_id = parseInt(buildingId);
    if (floorId) filters.floor_id = parseInt(floorId);
    if (roomId) filters.room_id = parseInt(roomId);
    if (status) filters.status = status;

    return this.cameraService.findAll(Object.keys(filters).length > 0 ? filters : undefined);
  }

  @Get('stats')
  @Public()
  getStats() {
    return this.cameraService.getStats();
  }

  @Get('stats/building/:buildingId')
  @Public()
  getBuildingStats(@Param('buildingId', ParseIntPipe) buildingId: number) {
    return this.cameraService.getByBuildingStats(buildingId);
  }

  @Get('by-code/:cameraCode')
  @Public()
  findByCameraCode(@Param('cameraCode') cameraCode: string) {
    return this.cameraService.findByCameraCode(cameraCode);
  }

  @Get('building/:buildingId')
  @Public()
  findByBuilding(@Param('buildingId', ParseIntPipe) buildingId: number) {
    return this.cameraService.findByBuilding(buildingId);
  }

  @Get('room/:roomId')
  @Public()
  findByRoom(@Param('roomId', ParseIntPipe) roomId: number) {
    return this.cameraService.findByRoom(roomId);
  }

  @Get(':id')
  @Public()
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.cameraService.findOne(id);
  }

  @Post()
  create(@Body() createCameraDto: CreateCameraDto) {
    return this.cameraService.create(createCameraDto);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() updateCameraDto: UpdateCameraDto) {
    return this.cameraService.update(id, updateCameraDto);
  }

  @Patch(':id/status')
  updateStatus(@Param('id', ParseIntPipe) id: number, @Body('status') status: string) {
    return this.cameraService.updateStatus(id, status);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.cameraService.remove(id);
  }
}

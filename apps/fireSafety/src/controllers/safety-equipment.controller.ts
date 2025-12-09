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
import { SafetyEquipmentService } from '../services/safety-equipment.service';
import {
  CreateSafetyEquipmentDto,
  UpdateSafetyEquipmentDto,
} from '../dto/safety-equipment.dto';
import { EquipmentStatus } from '@app/entities';

@Controller('safety-equipment')
@UseGuards(JwtAuthGuard)
export class SafetyEquipmentController {
  constructor(
    private readonly safetyEquipmentService: SafetyEquipmentService,
  ) {}

  @Get()
  async findAll() {
    return this.safetyEquipmentService.findAll();
  }

  @Get('due')
  async findDue() {
    return this.safetyEquipmentService.findDueForMaintenance();
  }

  @Get('apartment/:apartmentId')
  async findByApartment(
    @Param('apartmentId', ParseIntPipe) apartmentId: number,
  ) {
    return this.safetyEquipmentService.findByApartment(apartmentId);
  }

  @Get('building/:buildingId')
  async findByBuilding(@Param('buildingId', ParseIntPipe) buildingId: number) {
    return this.safetyEquipmentService.findByBuilding(buildingId);
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.safetyEquipmentService.findOne(id);
  }

  @Post()
  async create(@Body() createEquipmentDto: CreateSafetyEquipmentDto) {
    return this.safetyEquipmentService.create(createEquipmentDto);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateEquipmentDto: UpdateSafetyEquipmentDto,
  ) {
    return this.safetyEquipmentService.update(id, updateEquipmentDto);
  }

  @Patch(':id/status/:status')
  async updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Param('status') status: EquipmentStatus,
  ) {
    return this.safetyEquipmentService.updateStatus(id, status);
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.safetyEquipmentService.remove(id);
  }
}

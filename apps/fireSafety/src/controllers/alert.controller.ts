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
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { AlertService } from '../services/alert.service';
import { CreateAlertDto, UpdateAlertDto } from '../dto/alert.dto';

@Controller('alerts')
@UseGuards(JwtAuthGuard)
export class AlertController {
  constructor(private readonly alertService: AlertService) {}

  @Get()
  async findAll() {
    return this.alertService.findAll();
  }

  @Get('active')
  async findActive() {
    return this.alertService.findActiveAlerts();
  }

  @Get('my-alerts')
  async getMyAlerts(@Request() req) {
    return this.alertService.findByUserId(req.user.sub);
  }

  @Get('building/:buildingId')
  async findByBuilding(@Param('buildingId', ParseIntPipe) buildingId: number) {
    return this.alertService.findByBuilding(buildingId);
  }

  @Get('apartment/:apartmentId')
  async findByApartment(
    @Param('apartmentId', ParseIntPipe) apartmentId: number,
  ) {
    return this.alertService.findByApartment(apartmentId);
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.alertService.findOne(id);
  }

  @Post()
  async create(@Body() createAlertDto: CreateAlertDto) {
    return this.alertService.create(createAlertDto);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateAlertDto: UpdateAlertDto,
  ) {
    return this.alertService.update(id, updateAlertDto);
  }

  @Patch(':id/resolve')
  async resolve(@Param('id', ParseIntPipe) id: number) {
    return this.alertService.markAsResolved(id);
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.alertService.remove(id);
  }
}

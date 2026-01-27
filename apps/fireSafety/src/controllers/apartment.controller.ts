import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
  ParseIntPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { ApartmentService } from '../services/apartment.service';
import { UpdateApartmentDto, AssignApartmentDto } from '../dto/apartment.dto';

@Controller('apartments')
@UseGuards(JwtAuthGuard)
export class ApartmentController {
  constructor(private readonly apartmentService: ApartmentService) {}

  @Get()
  async findAll() {
    return this.apartmentService.findAll();
  }

  @Get('my-apartment')
  async getMyApartment(@Request() req) {
    return this.apartmentService.findByUserId(req.user.sub);
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.apartmentService.findOne(id);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateApartmentDto: UpdateApartmentDto,
  ) {
    return this.apartmentService.update(id, updateApartmentDto);
  }

  @Post(':id/assign')
  async assignToUser(
    @Param('id', ParseIntPipe) id: number,
    @Body() assignDto: AssignApartmentDto,
  ) {
    return this.apartmentService.assignToUser(id, assignDto);
  }

  // Debug endpoint - remove in production
  @Get('debug/:email')
  async debugApartment(@Param('email') email: string) {
    return this.apartmentService.debugApartmentAssignment(email);
  }
}

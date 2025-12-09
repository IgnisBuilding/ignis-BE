import {
  Controller,
  Get,
  Param,
  UseGuards,
  Request,
  ParseIntPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { ApartmentService } from '../services/apartment.service';

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
}

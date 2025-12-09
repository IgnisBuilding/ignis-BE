import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
import { ResidentService } from '../services/resident.service';
import { CreateResidentDto, UpdateResidentDto } from '../dto/resident.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { Public } from '../decorators/public.decorator';

@Controller('residents')
@UseGuards(JwtAuthGuard)
export class ResidentController {
  constructor(private residentService: ResidentService) {}

  @Get()
  @Public()
  findAll(@Query('apartmentId') apartmentId?: string) {
    if (apartmentId) return this.residentService.findByApartment(parseInt(apartmentId));
    return this.residentService.findAll();
  }

  @Get('stats')
  @Public()
  getStats() {
    return this.residentService.getStats();
  }

  @Get(':id')
  @Public()
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.residentService.findOne(id);
  }

  @Post()
  create(@Body() createResidentDto: CreateResidentDto) {
    return this.residentService.create(createResidentDto);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() updateResidentDto: UpdateResidentDto) {
    return this.residentService.update(id, updateResidentDto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.residentService.remove(id);
  }
}

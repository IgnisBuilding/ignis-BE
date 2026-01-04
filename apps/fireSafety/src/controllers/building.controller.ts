import { Controller, Get, Post, Patch, Delete, UseGuards, Param, ParseIntPipe, Body } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { building, floor, apartment, Society } from '@app/entities';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { Public } from '../decorators/public.decorator';

@Controller('buildings')
@UseGuards(JwtAuthGuard)
export class BuildingController {
  constructor(
    @InjectRepository(building) private buildingRepo: Repository<building>,
    @InjectRepository(floor) private floorRepo: Repository<floor>,
    @InjectRepository(apartment) private apartmentRepo: Repository<apartment>,
    @InjectRepository(Society) private societyRepo: Repository<Society>,
  ) {}

  @Get()
  @Public()
  findAll() {
    return this.buildingRepo.find({ order: { created_at: 'DESC' } });
  }

  @Get('stats')
  @Public()
  async getStats() {
    const [totalBuildings, totalFloors, totalApartments] = await Promise.all([
      this.buildingRepo.count(),
      this.floorRepo.count(),
      this.apartmentRepo.count(),
    ]);
    return { totalBuildings, totalFloors, totalApartments };
  }

  @Get(':id')
  @Public()
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.buildingRepo.findOne({ where: { id } });
  }

  @Get(':id/floors')
  @Public()
  getFloors(@Param('id', ParseIntPipe) id: number) {
    return this.floorRepo.find({ where: { building_id: id }, order: { level: 'ASC' } });
  }

  @Get(':id/apartments')
  @Public()
  getApartments(@Param('id', ParseIntPipe) buildingId: number) {
    return this.apartmentRepo.find({ order: { unit_number: 'ASC' } });
  }

  @Post()
  @Public()
  async create(@Body() createDto: { 
    name: string; 
    address: string; 
    type?: string;
    society_id?: number;
  }) {
    const newBuilding = this.buildingRepo.create({
      name: createDto.name,
      address: createDto.address,
      type: createDto.type || 'residential',
      society_id: createDto.society_id || 1, // Default to society ID 1
      geometry: null, // Set geometry to null explicitly
    });
    return this.buildingRepo.save(newBuilding);
  }

  @Patch(':id')
  @Public()
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: { 
      name?: string; 
      address?: string; 
      type?: string;
      society_id?: number;
    },
  ) {
    await this.buildingRepo.update(id, updateDto);
    return this.buildingRepo.findOne({ where: { id } });
  }

  @Delete(':id')
  @Public()
  async delete(@Param('id', ParseIntPipe) id: number) {
    await this.buildingRepo.delete(id);
    return { message: 'Building deleted successfully' };
  }

  @Post('seed-societies')
  @Public()
  async seedSocieties() {
    const existingCount = await this.societyRepo.count();
    if (existingCount > 0) {
      return { message: 'Societies already exist', count: existingCount };
    }

    const societies = [
      { name: 'Green Valley Society', location: 'Downtown', owner_id: 1, brigade_id: 1 },
      { name: 'Sunset Heights Society', location: 'Westside', owner_id: 1, brigade_id: 1 },
      { name: 'Royal Gardens Society', location: 'East End', owner_id: 1, brigade_id: 1 },
    ];

    const created = await this.societyRepo.save(societies);
    return { message: 'Societies seeded successfully', societies: created };
  }
}

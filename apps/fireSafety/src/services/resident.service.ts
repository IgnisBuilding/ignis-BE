import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Resident } from '@app/entities';
import { CreateResidentDto, UpdateResidentDto } from '../dto/resident.dto';

@Injectable()
export class ResidentService {
  constructor(
    @InjectRepository(Resident)
    private residentRepository: Repository<Resident>,
  ) {}

  findAll() {
    return this.residentRepository.find({ relations: ['apartment'], order: { createdAt: 'DESC' } });
  }

  async findOne(id: number) {
    const resident = await this.residentRepository.findOne({ where: { id }, relations: ['apartment'] });
    if (!resident) throw new NotFoundException(`Resident with ID ${id} not found`);
    return resident;
  }

  findByApartment(apartmentId: number) {
    return this.residentRepository.find({ where: { apartmentId }, relations: ['apartment'] });
  }

  async create(createResidentDto: CreateResidentDto) {
    const existing = await this.residentRepository.findOne({ where: { email: createResidentDto.email } });
    if (existing) throw new ConflictException('Resident with this email already exists');
    const resident = this.residentRepository.create(createResidentDto);
    return this.residentRepository.save(resident);
  }

  async update(id: number, updateResidentDto: UpdateResidentDto) {
    const resident = await this.findOne(id);
    if (updateResidentDto.email && updateResidentDto.email !== resident.email) {
      const existing = await this.residentRepository.findOne({ where: { email: updateResidentDto.email } });
      if (existing) throw new ConflictException('Resident with this email already exists');
    }
    Object.assign(resident, updateResidentDto);
    return this.residentRepository.save(resident);
  }

  async remove(id: number) {
    const resident = await this.findOne(id);
    await this.residentRepository.remove(resident);
    return { message: 'Resident deleted successfully' };
  }

  async getStats() {
    const total = await this.residentRepository.count();
    const active = await this.residentRepository.count({ where: { isActive: true } });
    const byType = await this.residentRepository.createQueryBuilder('resident')
      .select('resident.type', 'type').addSelect('COUNT(*)', 'count')
      .groupBy('resident.type').getRawMany();
    return { total, active, byType };
  }
}

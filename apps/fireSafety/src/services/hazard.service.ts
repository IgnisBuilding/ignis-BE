import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { hazards } from '@app/entities';
import { CreateHazardDto, UpdateHazardDto } from '../dto/hazard.dto';

@Injectable()
export class HazardService {
  constructor(
    @InjectRepository(hazards)
    private hazardRepository: Repository<hazards>,
  ) {}

  async findAll(): Promise<hazards[]> {
    return this.hazardRepository.find({
      relations: ['apartment', 'apartment.floor', 'apartment.floor.building', 'node'],
      order: { created_at: 'DESC' },
    });
  }

  async findActive(): Promise<hazards[]> {
    return this.hazardRepository.find({
      where: { status: In(['reported', 'responding', 'active']) },
      relations: ['apartment', 'apartment.floor', 'apartment.floor.building', 'node'],
      order: { created_at: 'DESC' },
    });
  }

  async findOne(id: number): Promise<hazards> {
    const hazard = await this.hazardRepository.findOne({
      where: { id },
      relations: ['apartment', 'apartment.floor', 'apartment.floor.building', 'node'],
    });

    if (!hazard) {
      throw new NotFoundException(`Hazard with ID ${id} not found`);
    }

    return hazard;
  }

  async create(createHazardDto: CreateHazardDto): Promise<hazards> {
    const hazard = this.hazardRepository.create({
      type: createHazardDto.type,
      apartment: { id: createHazardDto.apartmentId } as any,
      node: { id: createHazardDto.nodeId } as any,
      severity: createHazardDto.severity,
      status: createHazardDto.status,
    });
    return this.hazardRepository.save(hazard);
  }

  async updateStatus(id: number, updateHazardDto: UpdateHazardDto): Promise<hazards> {
    const hazard = await this.findOne(id);
    hazard.status = updateHazardDto.status;
    return this.hazardRepository.save(hazard);
  }

  async respond(id: number): Promise<hazards> {
    const hazard = await this.findOne(id);
    hazard.status = 'responding';
    return this.hazardRepository.save(hazard);
  }

  async resolve(id: number): Promise<hazards> {
    const hazard = await this.findOne(id);
    hazard.status = 'resolved';
    return this.hazardRepository.save(hazard);
  }

  async delete(id: number): Promise<void> {
    const hazard = await this.findOne(id);
    await this.hazardRepository.remove(hazard);
  }
}

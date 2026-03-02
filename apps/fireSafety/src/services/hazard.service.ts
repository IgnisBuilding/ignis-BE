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
      relations: ['apartment', 'apartment.floor', 'apartment.floor.building', 'node', 'room', 'floor', 'floor.building'],
      order: { created_at: 'DESC' },
    });
  }

  async findActive(): Promise<hazards[]> {
    return this.hazardRepository.find({
      where: { status: In(['active', 'responded', 'pending']) },
      relations: ['apartment', 'apartment.floor', 'apartment.floor.building', 'node', 'room', 'floor', 'floor.building'],
      order: { created_at: 'DESC' },
    });
  }

  async findByBuilding(buildingId: number): Promise<hazards[]> {
    return this.hazardRepository
      .createQueryBuilder('hazard')
      .leftJoinAndSelect('hazard.node', 'node')
      .leftJoinAndSelect('hazard.room', 'room')
      .leftJoinAndSelect('hazard.floor', 'floor')
      .leftJoinAndSelect('floor.building', 'building')
      .where('floor.building_id = :buildingId', { buildingId })
      .andWhere('hazard.status IN (:...statuses)', { statuses: ['active', 'responded', 'pending'] })
      .orderBy('hazard.created_at', 'DESC')
      .getMany();
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
    // Build hazard object with only provided fields
    const hazardData: Partial<hazards> = {
      type: createHazardDto.type,
      severity: createHazardDto.severity,
      status: createHazardDto.status,
    };

    // Only set relations if IDs are provided
    if (createHazardDto.apartmentId) {
      hazardData.apartmentId = createHazardDto.apartmentId;
    }
    if (createHazardDto.nodeId) {
      hazardData.nodeId = createHazardDto.nodeId;
    }
    if (createHazardDto.roomId) {
      hazardData.roomId = createHazardDto.roomId;
    }
    if (createHazardDto.floorId) {
      hazardData.floorId = createHazardDto.floorId;
    }

    const hazard = this.hazardRepository.create(hazardData);
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
    hazard.responded_at = new Date();
    return this.hazardRepository.save(hazard);
  }

  async resolve(id: number): Promise<hazards> {
    const hazard = await this.findOne(id);
    hazard.status = 'resolved';
    hazard.resolved_at = new Date();
    return this.hazardRepository.save(hazard);
  }

  async delete(id: number): Promise<void> {
    const hazard = await this.findOne(id);
    await this.hazardRepository.remove(hazard);
  }
}

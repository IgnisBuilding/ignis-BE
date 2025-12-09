import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SafetyEquipment, EquipmentStatus } from '@app/entities';
import {
  CreateSafetyEquipmentDto,
  UpdateSafetyEquipmentDto,
} from '../dto/safety-equipment.dto';

@Injectable()
export class SafetyEquipmentService {
  constructor(
    @InjectRepository(SafetyEquipment)
    private readonly equipmentRepository: Repository<SafetyEquipment>,
  ) {}

  async findAll(): Promise<SafetyEquipment[]> {
    return this.equipmentRepository.find({
      relations: ['building', 'apartment'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: number): Promise<SafetyEquipment> {
    const equipment = await this.equipmentRepository.findOne({
      where: { id },
      relations: ['building', 'apartment'],
    });

    if (!equipment) {
      throw new NotFoundException(`Safety equipment with ID ${id} not found`);
    }

    return equipment;
  }

  async findByApartment(apartmentId: number): Promise<SafetyEquipment[]> {
    return this.equipmentRepository.find({
      where: { apartmentId },
      relations: ['building', 'apartment'],
      order: { type: 'ASC' },
    });
  }

  async findByBuilding(buildingId: number): Promise<SafetyEquipment[]> {
    return this.equipmentRepository.find({
      where: { buildingId },
      relations: ['building', 'apartment'],
      order: { type: 'ASC' },
    });
  }

  async findDueForMaintenance(): Promise<SafetyEquipment[]> {
    return this.equipmentRepository
      .createQueryBuilder('equipment')
      .where('equipment.status IN (:...statuses)', {
        statuses: [EquipmentStatus.DUE, EquipmentStatus.EXPIRED],
      })
      .orWhere('equipment.nextCheckDue < :now', { now: new Date() })
      .leftJoinAndSelect('equipment.building', 'building')
      .leftJoinAndSelect('equipment.apartment', 'apartment')
      .orderBy('equipment.nextCheckDue', 'ASC')
      .getMany();
  }

  async create(
    createEquipmentDto: CreateSafetyEquipmentDto,
  ): Promise<SafetyEquipment> {
    const equipment = this.equipmentRepository.create(createEquipmentDto);
    return this.equipmentRepository.save(equipment);
  }

  async update(
    id: number,
    updateEquipmentDto: UpdateSafetyEquipmentDto,
  ): Promise<SafetyEquipment> {
    const equipment = await this.findOne(id);
    Object.assign(equipment, updateEquipmentDto);
    return this.equipmentRepository.save(equipment);
  }

  async remove(id: number): Promise<void> {
    const equipment = await this.findOne(id);
    await this.equipmentRepository.remove(equipment);
  }

  async updateStatus(id: number, status: EquipmentStatus): Promise<SafetyEquipment> {
    const equipment = await this.findOne(id);
    equipment.status = status;
    return this.equipmentRepository.save(equipment);
  }
}

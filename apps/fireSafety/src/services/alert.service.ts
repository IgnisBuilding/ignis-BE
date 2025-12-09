import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Alert, AlertStatus } from '@app/entities';
import { CreateAlertDto, UpdateAlertDto } from '../dto/alert.dto';

@Injectable()
export class AlertService {
  constructor(
    @InjectRepository(Alert)
    private readonly alertRepository: Repository<Alert>,
  ) {}

  async findAll(): Promise<Alert[]> {
    return this.alertRepository.find({
      relations: ['building', 'apartment'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: number): Promise<Alert> {
    const alert = await this.alertRepository.findOne({
      where: { id },
      relations: ['building', 'apartment'],
    });

    if (!alert) {
      throw new NotFoundException(`Alert with ID ${id} not found`);
    }

    return alert;
  }

  async findByBuilding(buildingId: number): Promise<Alert[]> {
    return this.alertRepository.find({
      where: { buildingId },
      relations: ['building', 'apartment'],
      order: { createdAt: 'DESC' },
    });
  }

  async findByApartment(apartmentId: number): Promise<Alert[]> {
    return this.alertRepository.find({
      where: { apartmentId },
      relations: ['building', 'apartment'],
      order: { createdAt: 'DESC' },
    });
  }

  async findActiveAlerts(): Promise<Alert[]> {
    return this.alertRepository.find({
      where: { status: AlertStatus.ACTIVE },
      relations: ['building', 'apartment'],
      order: { createdAt: 'DESC' },
    });
  }

  async findByUserId(userId: number): Promise<Alert[]> {
    // Get alerts for user's apartment or building-wide alerts
    const query = this.alertRepository
      .createQueryBuilder('alert')
      .leftJoinAndSelect('alert.building', 'building')
      .leftJoinAndSelect('alert.apartment', 'apartment')
      .leftJoin('apartment', 'apt', 'alert.apartment_id = apt.id')
      .where('apt.user_id = :userId', { userId })
      .orWhere('alert.apartment_id IS NULL AND alert.building_id IN ' +
        '(SELECT DISTINCT b.id FROM building b ' +
        'INNER JOIN floor f ON f.building_id = b.id ' +
        'INNER JOIN apartment a ON a.floor_id = f.id ' +
        'WHERE a.user_id = :userId)', { userId })
      .orderBy('alert.created_at', 'DESC');

    return query.getMany();
  }

  async create(createAlertDto: CreateAlertDto): Promise<Alert> {
    const alert = this.alertRepository.create(createAlertDto);
    return this.alertRepository.save(alert);
  }

  async update(id: number, updateAlertDto: UpdateAlertDto): Promise<Alert> {
    const alert = await this.findOne(id);
    Object.assign(alert, updateAlertDto);
    return this.alertRepository.save(alert);
  }

  async remove(id: number): Promise<void> {
    const alert = await this.findOne(id);
    await this.alertRepository.remove(alert);
  }

  async markAsResolved(id: number): Promise<Alert> {
    const alert = await this.findOne(id);
    alert.status = AlertStatus.RESOLVED;
    return this.alertRepository.save(alert);
  }
}

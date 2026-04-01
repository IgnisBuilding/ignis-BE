import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Alert, AlertStatus } from '@app/entities';
import { CreateAlertDto, UpdateAlertDto } from '../dto/alert.dto';

@Injectable()
export class AlertService {
  private readonly logger = new Logger(AlertService.name);
  private readonly warningCooldownMs = Number(process.env.ALERT_SERVICE_WARNING_COOLDOWN_MS || 300000);
  private lastWarningAtByOperation = new Map<string, number>();

  constructor(
    @InjectRepository(Alert)
    private readonly alertRepository: Repository<Alert>,
  ) {}

  private isMissingAlertsTableError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    const code = (error as { code?: string }).code;
    const query = (error as { query?: string }).query;
    return code === '42P01' && typeof query === 'string' && query.includes('"alerts"');
  }

  private isTransientDbReadError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    const code = (error as { code?: string }).code;
    const message = (error as { message?: string }).message || '';

    // Network/DNS/connection blips from hosted Postgres are common; avoid noisy hard failures for read paths.
    if (code === 'EAI_AGAIN' || code === 'ECONNRESET' || code === 'ETIMEDOUT') {
      return true;
    }

    return (
      message.includes('getaddrinfo EAI_AGAIN') ||
      message.includes('Connection terminated unexpectedly') ||
      message.includes('connection terminated') ||
      message.includes('timeout')
    );
  }

  private warnThrottled(operation: string, message: string) {
    const now = Date.now();
    const last = this.lastWarningAtByOperation.get(operation) || 0;
    if (now - last >= this.warningCooldownMs) {
      this.logger.warn(message);
      this.lastWarningAtByOperation.set(operation, now);
    }
  }

  private handleMissingAlertsTable(operation: string, error: unknown): Alert[] {
    if (!this.isMissingAlertsTableError(error)) {
      if (this.isTransientDbReadError(error)) {
        this.warnThrottled(
          operation,
          `Transient database issue while executing ${operation}. Returning an empty alert list.`,
        );
        return [];
      }

      throw error;
    }

    this.warnThrottled(
      operation,
      `Alerts table is missing while executing ${operation}. Returning an empty alert list.`,
    );

    return [];
  }

  async findAll(): Promise<Alert[]> {
    try {
      return await this.alertRepository.find({
        relations: ['building', 'apartment'],
        order: { createdAt: 'DESC' },
      });
    } catch (error) {
      return this.handleMissingAlertsTable('findAll', error);
    }
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
    try {
      return await this.alertRepository.find({
        where: { buildingId },
        relations: ['building', 'apartment'],
        order: { createdAt: 'DESC' },
      });
    } catch (error) {
      return this.handleMissingAlertsTable('findByBuilding', error);
    }
  }

  async findByApartment(apartmentId: number): Promise<Alert[]> {
    try {
      return await this.alertRepository.find({
        where: { apartmentId },
        relations: ['building', 'apartment'],
        order: { createdAt: 'DESC' },
      });
    } catch (error) {
      return this.handleMissingAlertsTable('findByApartment', error);
    }
  }

  async findActiveAlerts(): Promise<Alert[]> {
    try {
      return await this.alertRepository.find({
        where: { status: AlertStatus.ACTIVE },
        relations: ['building', 'apartment'],
        order: { createdAt: 'DESC' },
      });
    } catch (error) {
      return this.handleMissingAlertsTable('findActiveAlerts', error);
    }
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

    try {
      return await query.getMany();
    } catch (error) {
      return this.handleMissingAlertsTable('findByUserId', error);
    }
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

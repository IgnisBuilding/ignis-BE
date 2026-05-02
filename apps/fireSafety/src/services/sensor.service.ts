import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Sensor, SensorLog } from '@app/entities';
import { CreateSensorDto, UpdateSensorDto, SensorReadingDto } from '../dto/sensor.dto';
import { FireDetectionGateway } from '../gateways/fire-detection.gateway';
import { FireDetectionService } from './fire-detection.service';

@Injectable()
export class SensorService {
  private readonly logger = new Logger(SensorService.name);

  constructor(
    @InjectRepository(Sensor)
    private sensorRepository: Repository<Sensor>,
    @InjectRepository(SensorLog)
    private sensorLogRepository: Repository<SensorLog>,
    private fireDetectionGateway: FireDetectionGateway,
    private fireDetectionService: FireDetectionService,
  ) {}

  findAll() {
    return this.sensorRepository.find({ 
      relations: ['room', 'room.floor', 'room.floor.building', 'floor', 'floor.building', 'building'], 
      order: { createdAt: 'DESC' } 
    });
  }

  async findOne(id: number) {
    const sensor = await this.sensorRepository.findOne({ 
      where: { id }, 
      relations: ['room', 'room.floor', 'room.floor.building', 'floor', 'floor.building', 'building'] 
    });
    if (!sensor) throw new NotFoundException(`Sensor with ID ${id} not found`);
    return sensor;
  }

  findByRoom(roomId: number) {
    return this.sensorRepository.find({ where: { roomId }, relations: ['room'] });
  }

  findByStatus(status: string) {
    return this.sensorRepository.find({ where: { status }, relations: ['room'] });
  }

  create(createSensorDto: CreateSensorDto) {
    const sensor = this.sensorRepository.create({ ...createSensorDto, lastReading: new Date() });
    return this.sensorRepository.save(sensor);
  }

  async update(id: number, updateSensorDto: UpdateSensorDto) {
    const sensor = await this.findOne(id);
    Object.assign(sensor, { ...updateSensorDto, lastReading: new Date() });
    return this.sensorRepository.save(sensor);
  }

  async updateReading(id: number, value: number, status?: string, alertTypeOverride?: string) {
    // Environment-controlled thresholds for smart logging
    const DELTA_THRESHOLD = parseFloat(process.env.SENSOR_LOG_DELTA_THRESHOLD || '5');
    const MIN_LOG_INTERVAL = parseInt(process.env.SENSOR_LOG_MIN_INTERVAL || '60000'); // 60 seconds

    const updatePayload: Partial<Sensor> = {
      value,
      lastReading: new Date(),
    };

    if (status) {
      // Keep runtime status for alert logic, but persist a DB-safe state because
      // some deployed schemas only allow active/inactive/maintenance values.
      updatePayload.status =
        status === 'safe' || status === 'warning' || status === 'alert'
          ? 'active'
          : status;
    }

    const updateResult = await this.sensorRepository.update(id, updatePayload);
    if (!updateResult.affected) {
      throw new NotFoundException(`Sensor with ID ${id} not found`);
    }

    const sensor = await this.sensorRepository.findOne({ where: { id } });
    if (!sensor) {
      throw new NotFoundException(`Sensor with ID ${id} not found`);
    }

    if (sensor.hardwareUid === 'MQ5' || sensor.hardwareUid === 'MQ7' || /^Arduino MQ-[57]$/i.test(sensor.name)) {
      updatePayload.unit = 'adc';
    }

    // Decide whether to write to sensor_log based on smart logging strategy
    const isAlert = status === 'alert';
    let shouldLog = isAlert; // Always log alerts

    if (!isAlert) {
      const now = Date.now();
      const lastLoggedTime = sensor.lastLoggedAt ? new Date(sensor.lastLoggedAt).getTime() : 0;
      const timeSinceLastLog = now - lastLoggedTime;

      // Check if value delta exceeds threshold
      const lastValue = sensor.lastLoggedValue ?? sensor.value;
      const valueDelta = Math.abs(value - lastValue);

      // Log if: delta exceeded OR minimum interval elapsed (heartbeat)
      shouldLog = valueDelta >= DELTA_THRESHOLD || timeSinceLastLog >= MIN_LOG_INTERVAL;
    }

    if (shouldLog) {
      // Map sensor type to the allowed detection_type enum in sensor_log
      const detectionTypeMap: Record<string, string> = {
        gas: 'gas',
        smoke: 'smoke',
        heat: 'heat',
        carbon_monoxide: 'carbon_monoxide',
        flame: 'flame',
        water_leak: 'water_leak',
        motion: 'motion',
        temperature: 'temperature',
        humidity: 'humidity',
      };
      const detectionType = detectionTypeMap[sensor.type] || 'other';

      try {
        await this.sensorLogRepository.save(
          this.sensorLogRepository.create({
            sensorId: sensor.id,
            detectionType,
            value,
            unit: sensor.unit,
            isAlert,
            alertType: isAlert ? alertTypeOverride || `${sensor.type}_threshold_exceeded` : null,
          })
        );

        // Update tracking columns
        updatePayload.lastLoggedValue = value;
        updatePayload.lastLoggedAt = new Date();
        await this.sensorRepository.update(id, updatePayload);
      } catch (err) {
        // Silent fail on log write - don't interrupt sensor stream
      }
    }

    return sensor;
  }

  async handleReading(dto: SensorReadingDto) {
    const sensor = await this.sensorRepository.findOne({
      where: { hardwareUid: dto.uid, status: 'active' },
      relations: ['room', 'floor', 'building'],
    });

    if (!sensor) {
      throw new NotFoundException(`Sensor uid '${dto.uid}' not registered or not active`);
    }

    const isAlert = !!sensor.alertThreshold && dto.ppm >= sensor.alertThreshold;
    const isWarning = !isAlert && !!sensor.warningThreshold && dto.ppm >= sensor.warningThreshold;
    const runtimeStatus = (isAlert ? 'alert' : isWarning ? 'warning' : 'safe') as 'alert' | 'warning' | 'safe';

    // Always log — Python agent already controls send rate
    await this.sensorLogRepository.save(
      this.sensorLogRepository.create({
        sensorId: sensor.id,
        detectionType: 'gas',
        value: dto.ppm,
        unit: 'ppm',
        isAlert,
        alertType: isAlert ? 'gas_threshold_exceeded' : null,
      }),
    );

    // Update current value and last_reading timestamp
    await this.sensorRepository.update(sensor.id, {
      value: dto.ppm,
      lastReading: new Date(dto.timestamp * 1000),
    });

    const wsEvent = {
      sensor_id: sensor.id,
      sensor_key: dto.uid,
      name: sensor.name,
      type: sensor.type,
      value: dto.ppm,
      unit: 'ppm',
      status: runtimeStatus,
      timestamp: Date.now(),
      room_id: sensor.room?.id,
      floor_id: sensor.floor?.id,
      building_id: sensor.building?.id,
    };

    this.fireDetectionGateway.emitSensorReading(wsEvent);

    if (isAlert) {
      this.fireDetectionGateway.emitSensorAlert(wsEvent);
      await this.fireDetectionService.checkAndLogic(sensor.room?.id, sensor.building?.id);
    }

    return { status: 'ok', sensor_id: sensor.id, resolved_status: runtimeStatus };
  }

  async remove(id: number) {
    const sensor = await this.findOne(id);
    await this.sensorRepository.remove(sensor);
    return { message: 'Sensor deleted successfully' };
  }

  async getStats() {
    const total = await this.sensorRepository.count();
    const active = await this.sensorRepository.count({ where: { status: 'active' } });
    const warning = await this.sensorRepository.count({ where: { status: 'warning' } });
    const alert = await this.sensorRepository.count({ where: { status: 'alert' } });
    const inactive = await this.sensorRepository.count({ where: { status: 'inactive' } });
    return { total, active, warning, alert, inactive };
  }
}

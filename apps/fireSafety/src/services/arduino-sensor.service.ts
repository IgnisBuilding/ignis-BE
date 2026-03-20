import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Sensor } from '@app/entities';
import {
  FireDetectionGateway,
  SensorReadingEvent,
} from '../gateways/fire-detection.gateway';
import { SensorService } from './sensor.service';

type SensorKey = 'MQ7' | 'MQ5';
type RuntimeStatus = 'safe' | 'warning' | 'alert';

@Injectable()
export class ArduinoSensorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ArduinoSensorService.name);

  private readonly mode = (process.env.ARDUINO_MODE || 'mock').toLowerCase() as 'mock' | 'hardware';
  private readonly comPort = process.env.ARDUINO_COM_PORT || 'COM3';
  private readonly baudRate = Number(process.env.ARDUINO_BAUD_RATE || 9600);
  private readonly reconnectMs = Number(process.env.ARDUINO_RECONNECT_MS || 5000);
  private readonly mockIntervalMs = Number(process.env.ARDUINO_MOCK_INTERVAL_MS || 2000);

  private readonly mq7Warning = Number(process.env.MQ7_WARNING_THRESHOLD || 300);
  private readonly mq7Alert = Number(process.env.MQ7_ALERT_THRESHOLD || 600);
  private readonly mq5Warning = Number(process.env.MQ5_WARNING_THRESHOLD || 350);
  private readonly mq5Alert = Number(process.env.MQ5_ALERT_THRESHOLD || 700);

  private port: any = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private mockTimer: NodeJS.Timeout | null = null;
  private serialBuffer = '';

  private sensorIdByKey: Partial<Record<SensorKey, number>> = {};
  private startedAt = new Date();
  private lastPacketAt: Date | null = null;
  private lastPacketRaw: string | null = null;
  private packetCount = 0;
  private lastError: string | null = null;
  private isConnected = false;
  private isMockTickRunning = false;

  constructor(
    @InjectRepository(Sensor)
    private readonly sensorRepository: Repository<Sensor>,
    private readonly sensorService: SensorService,
    @Inject(forwardRef(() => FireDetectionGateway))
    private readonly gateway: FireDetectionGateway,
  ) {}

  async onModuleInit() {
    this.startedAt = new Date();
    await this.ensureSensorRegistry();

    if (this.mode === 'hardware') {
      void this.connectHardware();
      return;
    }

    this.startMockStream();
  }

  onModuleDestroy() {
    if (this.mockTimer) {
      clearInterval(this.mockTimer);
      this.mockTimer = null;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.port?.isOpen) {
      this.port.close();
    }
  }

  private async ensureSensorRegistry() {
    const mq7IdEnv = process.env.MQ7_SENSOR_ID;
    const mq5IdEnv = process.env.MQ5_SENSOR_ID;

    if (mq7IdEnv && !Number.isNaN(Number(mq7IdEnv))) {
      this.sensorIdByKey.MQ7 = Number(mq7IdEnv);
    }

    if (mq5IdEnv && !Number.isNaN(Number(mq5IdEnv))) {
      this.sensorIdByKey.MQ5 = Number(mq5IdEnv);
    }

    if (!this.sensorIdByKey.MQ7) {
      const sensor = await this.findOrCreateSensor('Arduino MQ-7', 'gas');
      this.sensorIdByKey.MQ7 = sensor.id;
    }

    if (!this.sensorIdByKey.MQ5) {
      const sensor = await this.findOrCreateSensor('Arduino MQ-5', 'gas');
      this.sensorIdByKey.MQ5 = sensor.id;
    }

    this.logger.log(
      `Arduino sensor mapping ready: MQ7->${this.sensorIdByKey.MQ7}, MQ5->${this.sensorIdByKey.MQ5}`,
    );
  }

  private async findOrCreateSensor(name: string, type: string): Promise<Sensor> {
    const existing = await this.sensorRepository.findOne({ where: { name } });
    if (existing) {
      return existing;
    }

    const created = this.sensorRepository.create({
      name,
      type,
      value: 0,
      unit: 'ppm',
      status: 'active',
      lastReading: new Date(),
    });

    return this.sensorRepository.save(created);
  }

  private startMockStream() {
    this.logger.log(`Starting Arduino sensor mock stream (${this.mockIntervalMs}ms interval)`);

    this.isConnected = true;

    this.gateway.emitSensorConnection({
      source: 'arduino',
      mode: 'mock',
      connected: true,
      timestamp: Date.now(),
    });

    this.mockTimer = setInterval(() => {
      if (this.isMockTickRunning) {
        return;
      }

      this.isMockTickRunning = true;
      const mq7 = this.randomRange(180, 780);
      const mq5 = this.randomRange(220, 850);

      Promise.all([this.processPacket('MQ7', mq7), this.processPacket('MQ5', mq5)])
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          this.lastError = message;
          this.logger.warn(`Mock sensor tick failed: ${message}`);
        })
        .finally(() => {
          this.isMockTickRunning = false;
        });
    }, this.mockIntervalMs);
  }

  private async connectHardware() {
    if (this.port?.isOpen) {
      return;
    }

    this.logger.log(`Connecting to Arduino on ${this.comPort} @ ${this.baudRate}`);

    const serialport = await import('serialport');
    const SerialPortCtor = serialport.SerialPort;

    this.port = new SerialPortCtor({
      path: this.comPort,
      baudRate: this.baudRate,
      autoOpen: false,
    });

    this.port.on('open', () => {
      this.logger.log(`Arduino serial port opened on ${this.comPort}`);
      this.serialBuffer = '';
      this.isConnected = true;
      this.lastError = null;
      this.gateway.emitSensorConnection({
        source: 'arduino',
        mode: 'hardware',
        connected: true,
        port: this.comPort,
        timestamp: Date.now(),
      });
    });

    this.port.on('data', (chunk: Buffer) => {
      this.handleSerialChunk(chunk.toString('utf-8'));
    });

    this.port.on('error', (error) => {
      this.logger.error(`Arduino serial error: ${error.message}`);
      this.isConnected = false;
      this.lastError = error.message;
      this.gateway.emitSensorConnection({
        source: 'arduino',
        mode: 'hardware',
        connected: false,
        port: this.comPort,
        timestamp: Date.now(),
      });
      this.scheduleReconnect();
    });

    this.port.on('close', () => {
      this.logger.warn(`Arduino serial port closed on ${this.comPort}`);
      this.isConnected = false;
      this.gateway.emitSensorConnection({
        source: 'arduino',
        mode: 'hardware',
        connected: false,
        port: this.comPort,
        timestamp: Date.now(),
      });
      this.scheduleReconnect();
    });

    this.port.open((error) => {
      if (error) {
        this.logger.error(`Failed to open serial port ${this.comPort}: ${error.message}`);
        this.lastError = error.message;
        this.scheduleReconnect();
      }
    });
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) {
      return;
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connectHardware();
    }, this.reconnectMs);
  }

  private handleSerialChunk(chunk: string) {
    this.serialBuffer += chunk;
    const lines = this.serialBuffer.split(/\r?\n/);
    this.serialBuffer = lines.pop() || '';

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        continue;
      }

      this.lastPacketRaw = line;

      const parsed = this.parseLine(line);
      if (!parsed) {
        this.logger.warn(`Ignoring invalid Arduino packet: "${line}"`);
        continue;
      }

      this.processPacket(parsed.key, parsed.value).catch((error) => {
        this.logger.error(`Failed to process Arduino packet ${line}: ${error.message}`);
      });
    }
  }

  private parseLine(line: string): { key: SensorKey; value: number } | null {
    const match = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(-?\d+(?:\.\d+)?)$/);
    if (!match) {
      return null;
    }

    const normalizedKey = match[1].toUpperCase().replace('-', '');
    const value = Number(match[2]);

    if (Number.isNaN(value)) {
      return null;
    }

    if (normalizedKey !== 'MQ7' && normalizedKey !== 'MQ5') {
      return null;
    }

    return {
      key: normalizedKey,
      value,
    };
  }

  private async processPacket(key: SensorKey, value: number) {
    const sensorId = this.sensorIdByKey[key];
    if (!sensorId) {
      this.logger.warn(`No sensor mapping found for key ${key}`);
      return;
    }

    const status = this.computeStatus(key, value);
    this.lastPacketAt = new Date();
    this.packetCount += 1;
    let updatedSensor: Sensor;

    try {
      updatedSensor = await this.sensorService.updateReading(sensorId, value, 'active');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.lastError = message;
      this.logger.warn(`Failed to persist Arduino reading for ${key}: ${message}`);
      return;
    }

    const readingEvent: SensorReadingEvent = {
      sensor_id: updatedSensor.id,
      sensor_key: key,
      name: updatedSensor.name,
      type: updatedSensor.type,
      value,
      unit: updatedSensor.unit || 'ppm',
      status,
      timestamp: Date.now(),
      room_id: updatedSensor.roomId || undefined,
      floor_id: updatedSensor.floorId || undefined,
      building_id: updatedSensor.buildingId || undefined,
    };

    this.gateway.emitSensorReading(readingEvent);
    if (status === 'alert') {
      this.gateway.emitSensorAlert(readingEvent);
    }
  }

  private computeStatus(key: SensorKey, value: number): RuntimeStatus {
    const warningThreshold = key === 'MQ7' ? this.mq7Warning : this.mq5Warning;
    const alertThreshold = key === 'MQ7' ? this.mq7Alert : this.mq5Alert;

    if (value >= alertThreshold) {
      return 'alert';
    }

    if (value >= warningThreshold) {
      return 'warning';
    }

    return 'safe';
  }

  private randomRange(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  getHealth() {
    return {
      source: 'arduino',
      mode: this.mode,
      connected: this.isConnected,
      port: this.mode === 'hardware' ? this.comPort : null,
      baudRate: this.mode === 'hardware' ? this.baudRate : null,
      reconnectMs: this.reconnectMs,
      packetCount: this.packetCount,
      lastPacketAt: this.lastPacketAt?.toISOString() ?? null,
      lastPacketRaw: this.lastPacketRaw,
      lastError: this.lastError,
      startedAt: this.startedAt.toISOString(),
      sensorMapping: this.sensorIdByKey,
      thresholds: {
        MQ7: {
          warning: this.mq7Warning,
          alert: this.mq7Alert,
        },
        MQ5: {
          warning: this.mq5Warning,
          alert: this.mq5Alert,
        },
      },
    };
  }
}

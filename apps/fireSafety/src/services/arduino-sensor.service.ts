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
import { Sensor, camera } from '@app/entities';
import * as http from 'http';
import * as https from 'https';
import {
  FireDetectionGateway,
  SensorReadingEvent,
} from '../gateways/fire-detection.gateway';
import { SensorService } from './sensor.service';
import { FireDetectionService } from './fire-detection.service';

type SensorKey = 'MQ7' | 'MQ5';
type RuntimeStatus = 'safe' | 'warning' | 'alert';

@Injectable()
export class ArduinoSensorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ArduinoSensorService.name);

  private readonly mode = (process.env.ARDUINO_MODE || 'hardware').toLowerCase() as 'mock' | 'hardware' | 'off';
  private readonly comPort = process.env.ARDUINO_COM_PORT || 'COM3';
  private readonly baudRate = Number(process.env.ARDUINO_BAUD_RATE || 9600);
  private readonly reconnectMs = Number(process.env.ARDUINO_RECONNECT_MS || 5000);
  private readonly mockIntervalMs = Number(process.env.ARDUINO_MOCK_INTERVAL_MS || 2000);
  private readonly autoCreateSensors = (process.env.ARDUINO_AUTO_CREATE_SENSORS || 'false').toLowerCase() === 'true';
  private readonly enableLegacySensorValueFallback =
    (process.env.ARDUINO_ENABLE_LEGACY_SENSOR_VALUE_FALLBACK || 'false').toLowerCase() === 'true';
  private readonly autoDetectPort = (process.env.ARDUINO_AUTO_DETECT_PORTS || 'true').toLowerCase() === 'true';
  private readonly portHints = (process.env.ARDUINO_PORT_HINTS || 'arduino,ch340,cp210,usb,ttyacm,ttyusb')
    .split(',')
    .map((hint) => hint.trim().toLowerCase())
    .filter(Boolean);

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
  private activePortPath: string | null = null;
  private missingPortNoticeShown = false;
  private lastPortWarningTime = 0;
  private portWarningCooldown = 30000; // Only warn every 30 seconds
  private readonly debugMode = process.env.ARDUINO_DEBUG === 'true';
  private readonly packetWarningCooldownMs = 60000;
  private lastMissingMappingWarningAt: Partial<Record<SensorKey, number>> = {};
  private lastPersistWarningAt: Partial<Record<SensorKey, number>> = {};
  private lastHardwareLabelByKey: Partial<Record<SensorKey, string>> = {};
  private lastValueByKey: Partial<Record<SensorKey, number>> = {};
  private lastSeenAtByKey: Partial<Record<SensorKey, Date>> = {};

  constructor(
    @InjectRepository(Sensor)
    private readonly sensorRepository: Repository<Sensor>,
    @InjectRepository(camera)
    private readonly cameraRepository: Repository<camera>,
    private readonly sensorService: SensorService,
    private readonly fireDetectionService: FireDetectionService,
    @Inject(forwardRef(() => FireDetectionGateway))
    private readonly gateway: FireDetectionGateway,
  ) {}

  async onModuleInit() {
    this.startedAt = new Date();
    await this.ensureSensorRegistry();

    if (this.mode === 'off') {
      this.logger.log('Arduino sensor stream is disabled (ARDUINO_MODE=off).');
      this.gateway.emitSensorConnection({
        source: 'arduino',
        mode: 'hardware',
        connected: false,
        timestamp: Date.now(),
      });
      return;
    }

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

    if (!this.sensorIdByKey.MQ7 && this.autoCreateSensors) {
      const sensor = await this.findOrCreateSensor('Arduino MQ-7', 'gas');
      this.sensorIdByKey.MQ7 = sensor.id;
    }

    if (!this.sensorIdByKey.MQ5 && this.autoCreateSensors) {
      const sensor = await this.findOrCreateSensor('Arduino MQ-5', 'gas');
      this.sensorIdByKey.MQ5 = sensor.id;
    }

    if (this.debugMode) {
      this.logger.log(
        `Arduino sensor mapping ready: MQ7->${this.sensorIdByKey.MQ7}, MQ5->${this.sensorIdByKey.MQ5}`,
      );
    }
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
      unit: 'adc',
      status: 'active',
      lastReading: new Date(),
    });

    return this.sensorRepository.save(created);
  }

  private startMockStream() {
    if (this.debugMode) {
      this.logger.log(`Starting Arduino sensor mock stream (${this.mockIntervalMs}ms interval)`);
    }
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
          if (this.debugMode) {
            this.logger.warn(`Mock tick failed: ${message}`);
          }
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

    if (this.port) {
      this.port.removeAllListeners?.();
      this.port = null;
    }

    const serialport = await import('serialport');
    const SerialPortCtor = serialport.SerialPort;

    const targetPort = await this.resolveTargetPort(SerialPortCtor);
    if (!targetPort) {
      this.isConnected = false;
      this.activePortPath = null;
      this.lastError = 'No serial port detected';

      const now = Date.now();
      if (now - this.lastPortWarningTime > this.portWarningCooldown) {
        this.logger.warn(`No Arduino attached. Waiting... (${this.comPort})`);
        this.lastPortWarningTime = now;
      }

      this.gateway.emitSensorConnection({
        source: 'arduino',
        mode: 'hardware',
        connected: false,
        port: this.comPort,
        timestamp: Date.now(),
      });
      this.scheduleReconnect();
      return;
    }

    if (this.debugMode) {
      this.logger.log(`Connecting to Arduino on ${targetPort} @ ${this.baudRate}`);
    }

    this.port = new SerialPortCtor({
      path: targetPort,
      baudRate: this.baudRate,
      autoOpen: false,
    });

    this.port.on('open', () => {
      if (this.debugMode) {
        this.logger.log(`Arduino serial port opened on ${targetPort}`);
      }
      this.serialBuffer = '';
      this.isConnected = true;
      this.activePortPath = targetPort;
      this.lastError = null;
      this.lastPortWarningTime = 0;
      this.gateway.emitSensorConnection({
        source: 'arduino',
        mode: 'hardware',
        connected: true,
        port: targetPort,
        timestamp: Date.now(),
      });
    });

    this.port.on('data', (chunk: Buffer) => {
      this.handleSerialChunk(chunk.toString('utf-8'));
    });

    this.port.on('error', (error) => {
      const message = error?.message || 'Unknown serial error';
      const missingPort = /file not found|cannot find|enoent|cannot open/i.test(message);
      if (missingPort) {
        const now = Date.now();
        if (now - this.lastPortWarningTime > this.portWarningCooldown) {
          this.logger.warn(`Arduino port unavailable. Retrying...`);
          this.lastPortWarningTime = now;
        }
      } else if (this.debugMode) {
        this.logger.error(`Arduino serial error: ${message}`);
      }
      this.isConnected = false;
      this.activePortPath = null;
      this.lastError = message;
      this.gateway.emitSensorConnection({
        source: 'arduino',
        mode: 'hardware',
        connected: false,
        port: targetPort,
        timestamp: Date.now(),
      });
      this.scheduleReconnect();
    });

    this.port.on('close', () => {
      if (this.debugMode) {
        this.logger.warn(`Arduino serial port closed on ${targetPort}`);
      }
      this.isConnected = false;
      this.activePortPath = null;
      this.gateway.emitSensorConnection({
        source: 'arduino',
        mode: 'hardware',
        connected: false,
        port: targetPort,
        timestamp: Date.now(),
      });
      this.scheduleReconnect();
    });

    this.port.open((error) => {
      if (error) {
        const message = error?.message || 'Unknown open error';
        const missingPort = /file not found|cannot find|enoent|cannot open/i.test(message);
        if (missingPort) {
          const now = Date.now();
          if (now - this.lastPortWarningTime > this.portWarningCooldown) {
            this.logger.warn(`Arduino not ready. Retrying...`);
            this.lastPortWarningTime = now;
          }
        } else if (this.debugMode) {
          this.logger.error(`Failed to open serial port: ${message}`);
        }
        this.lastError = message;
        this.activePortPath = null;
        this.scheduleReconnect();
      }
    });
  }

  private async resolveTargetPort(SerialPortCtor: any): Promise<string | null> {
    if (!this.autoDetectPort) {
      return this.comPort;
    }

    let ports: any[] = [];
    try {
      ports = await SerialPortCtor.list();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.lastError = `Serial port discovery failed: ${message}`;

      // Some environments (containers/minimal Linux images) don't provide udevadm.
      // In that case, fall back to configured port instead of crashing startup.
      if (/udevadm|enoent|spawn/i.test(message)) {
        this.logger.warn(
          `Serial auto-detect unavailable (${message}). Falling back to configured port ${this.comPort}.`,
        );
        return this.comPort;
      }

      this.logger.warn(`Serial port discovery failed: ${message}. Falling back to configured port ${this.comPort}.`);
      return this.comPort;
    }

    if (!Array.isArray(ports) || ports.length === 0) {
      return null;
    }

    const configured = this.comPort.toLowerCase();
    const exactMatch = ports.find((port: any) => {
      const path = String(port?.path || '').toLowerCase();
      return path === configured || path.endsWith(`\\${configured}`) || path.endsWith(`/${configured}`) || path.endsWith(configured);
    });
    if (exactMatch?.path) {
      return exactMatch.path;
    }

    const configuredHintMatch = ports.find((port: any) => {
      const searchBlob = [port?.path, port?.friendlyName, port?.manufacturer, port?.vendorId, port?.productId, port?.serialNumber]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return searchBlob.includes(configured);
    });
    if (configuredHintMatch?.path) {
      return configuredHintMatch.path;
    }

    const hintedMatch = ports.find((port: any) => {
      const searchBlob = [
        port?.path,
        port?.friendlyName,
        port?.manufacturer,
        port?.vendorId,
        port?.productId,
        port?.serialNumber,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return this.portHints.some((hint) => searchBlob.includes(hint));
    });

    return hintedMatch?.path || ports[0]?.path || null;
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
        if (this.debugMode) {
          this.logger.warn(`Invalid packet: "${line}"`);
        }
        continue;
      }

      this.processPacket(parsed.key, parsed.value).catch((error) => {
        if (this.debugMode) {
          this.logger.error(`Failed to process packet: ${error.message}`);
        }
      });
    }
  }

  private parseLine(line: string): { key: SensorKey; value: number } | null {
    if (line.startsWith('MAP|')) {
      const parts = line.split('|');
      if (parts.length >= 4) {
        const keyBlob = `${parts[1] || ''} ${parts[2] || ''}`.toLowerCase();
        const analogValue = Number(parts[3]);

        if (!Number.isNaN(analogValue)) {
          if (keyBlob.includes('mq5')) {
            this.lastHardwareLabelByKey.MQ5 = parts[2] || 'MQ-5';
            return { key: 'MQ5', value: analogValue };
          }

          if (keyBlob.includes('mq7')) {
            this.lastHardwareLabelByKey.MQ7 = parts[2] || 'MQ-7';
            return { key: 'MQ7', value: analogValue };
          }
        }
      }
    }

    const match = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(-?\d+(?:\.\d+)?)$/);
    if (!match) {
      const fallbackMatch = line.match(/Sensor\s*Value\s*:\s*(-?\d+(?:\.\d+)?)/i);
      if (fallbackMatch && this.enableLegacySensorValueFallback) {
         return { key: 'MQ5', value: Number(fallbackMatch[1]) };
      }
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
    this.lastValueByKey[key] = value;
    this.lastSeenAtByKey[key] = new Date();

    // 1. Try to find sensor by unique hardware_uid (Serial/MAC) first
    let sensor = await this.sensorRepository.findOne({ where: { hardwareUid: key } });
    let sensorId = sensor?.id;
    if (sensorId) {
      this.sensorIdByKey[key] = sensorId;
    }

    // 2. Fallback to name/key mapping if no exact UID match
    if (!sensorId) {
      sensorId = this.sensorIdByKey[key];
      if (sensorId) {
        sensor = await this.sensorRepository.findOne({ where: { id: sensorId } });
      }
    }

    // 3. If hardware is connected but no DB sensor exists yet, register it from live packets.
    if (!sensorId && (this.mode === 'hardware' || this.autoCreateSensors)) {
      const label = this.lastHardwareLabelByKey[key] || `Arduino ${key}`;
      sensor = await this.ensureHardwareSensor(key, label);
      sensorId = sensor.id;
      this.sensorIdByKey[key] = sensor.id;
    }

    if (!sensorId || !sensor) {
      const now = Date.now();
      const lastWarn = this.lastMissingMappingWarningAt[key] || 0;
      if (now - lastWarn >= this.packetWarningCooldownMs) {
        this.logger.warn(`No sensor mapping/UID found for key ${key}`);
        this.lastMissingMappingWarningAt[key] = now;
      }
      return;
    }

    const status = this.computeStatus(key, value, sensor);
    this.lastPacketAt = new Date();
    this.packetCount += 1;
    let updatedSensor: Sensor;
    const alertType = status === 'alert' ? (key === 'MQ7' ? 'fire_alert' : 'gas_detection_alert') : undefined;

    try {
      updatedSensor = await this.sensorService.updateReading(sensorId, value, status, alertType);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.lastError = message;
      const now = Date.now();
      const lastWarn = this.lastPersistWarningAt[key] || 0;
      const transientDbIssue =
        message.includes('Connection terminated unexpectedly') ||
        message.includes('getaddrinfo EAI_AGAIN') ||
        message.includes('ECONNRESET') ||
        message.includes('timeout');

      // Only surface transient DB issues when debugging; otherwise keep stream quiet.
      if (now - lastWarn >= this.packetWarningCooldownMs && (!transientDbIssue || this.debugMode)) {
        this.logger.warn(`Failed to persist Arduino reading for ${key}: ${message}`);
        this.lastPersistWarningAt[key] = now;
      }
      return;
    }

    const readingEvent: SensorReadingEvent = {
      sensor_id: updatedSensor.id,
      sensor_key: key,
      name: updatedSensor.name,
      type: updatedSensor.type,
      value,
      unit: updatedSensor.unit || 'adc',
      status,
      timestamp: Date.now(),
      room_id: updatedSensor.roomId || undefined,
      floor_id: updatedSensor.floorId || undefined,
      building_id: updatedSensor.buildingId || undefined,
    };

    this.gateway.emitSensorReading(readingEvent);
    if (status === 'alert') {
      this.gateway.emitSensorAlert(readingEvent);

      // MQ-7 is treated as fire-risk and can drive fire detection orchestration.
      if (key === 'MQ7') {
        const eventTimestampSec = Math.floor(Date.now() / 1000);
        this.fireDetectionService.recordSensorAlert(updatedSensor, value, eventTimestampSec);

        // Notify fire-detect pipeline orchestrator (if configured) to start camera capture.
        void this.triggerFireDetectPipeline(updatedSensor, value).catch((err) => {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.warn(`Failed to notify fire-detect orchestrator: ${msg}`);
        });
      }
    }
  }

  private async ensureHardwareSensor(key: SensorKey, label: string): Promise<Sensor> {
    const existingByUid = await this.sensorRepository.findOne({ where: { hardwareUid: key } });
    if (existingByUid) {
      if (!existingByUid.name || /^arduino\s+mq-[57]$/i.test(existingByUid.name)) {
        existingByUid.name = label;
      }
      if (!existingByUid.unit || existingByUid.unit === 'ppm') {
        existingByUid.unit = 'adc';
      }
      existingByUid.status = existingByUid.status === 'safe' ? 'active' : existingByUid.status;
      return this.sensorRepository.save(existingByUid);
    }

    const existingByName = await this.sensorRepository.findOne({ where: { name: label } });
    if (existingByName) {
      existingByName.hardwareUid = key;
      if (!existingByName.unit || existingByName.unit === 'ppm') {
        existingByName.unit = 'adc';
      }
      if (existingByName.status === 'safe') {
        existingByName.status = 'active';
      }
      return this.sensorRepository.save(existingByName);
    }

    const created = this.sensorRepository.create({
      name: label,
      type: 'gas',
      value: 0,
      unit: 'adc',
      status: 'active',
      hardwareUid: key,
      lastReading: new Date(),
    });

    return this.sensorRepository.save(created);
  }

  private async triggerFireDetectPipeline(sensor: Sensor, sensorValue: number): Promise<void> {
    const triggerUrl = process.env.FIRE_DETECT_TRIGGER_URL;
    if (!triggerUrl) {
      if (this.debugMode) this.logger.debug('FIRE_DETECT_TRIGGER_URL not configured; skipping pipeline trigger');
      return;
    }

    const apiKey = process.env.FIRE_DETECT_TRIGGER_API_KEY;

    // Prefer cameras in the same room, fallback to building
    let cameras = [] as camera[];
    if (sensor.roomId) {
      cameras = await this.cameraRepository.find({ where: { room_id: sensor.roomId, status: 'active' } as any });
    }

    if ((!cameras || cameras.length === 0) && sensor.buildingId) {
      cameras = await this.cameraRepository.find({ where: { building_id: sensor.buildingId, status: 'active' } as any });
    }

    if (!cameras || cameras.length === 0) {
      this.logger.debug('No cameras found for sensor location; skipping pipeline trigger');
      return;
    }

    for (const cam of cameras) {
      if (!cam.is_fire_detection_enabled) continue;

      const payload = {
        camera_id: cam.camera_id,
        rtsp_url: cam.rtsp_url,
        reason: 'sensor_alert',
        sensor_id: sensor.id,
        sensor_value: sensorValue,
        privacy_mode: cam.privacy_mode ?? false,
        max_capture_seconds: parseInt(process.env.FIRE_DETECT_MAX_CAPTURE_SECONDS || '10', 10),
      };

      try {
        await this.postJson(triggerUrl, payload, apiKey);
        this.logger.log(`Requested fire-detect start for camera ${cam.camera_id}`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Failed to trigger fire-detect for camera ${cam.camera_id}: ${msg}`);
      }
    }
  }

  private async postJson(urlStr: string, data: any, apiKey?: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      try {
        const u = new URL(urlStr);
        const payload = JSON.stringify(data);
        const lib = u.protocol === 'https:' ? https : http;
        const options: any = {
          hostname: u.hostname,
          port: u.port ? Number(u.port) : u.protocol === 'https:' ? 443 : 80,
          path: u.pathname + (u.search || ''),
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
          },
        };
        if (apiKey) options.headers['x-api-key'] = apiKey;

        const req = lib.request(options, (res: any) => {
          const chunks: any[] = [];
          res.on('data', (chunk: any) => chunks.push(chunk));
          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve();
            } else {
              const body = Buffer.concat(chunks).toString('utf8');
              reject(new Error(`Trigger request failed: ${res.statusCode} ${body}`));
            }
          });
        });

        req.on('error', (e: Error) => reject(e));
        req.write(payload);
        req.end();
      } catch (e) {
        reject(e);
      }
    });
  }

  private computeStatus(key: SensorKey, value: number, sensor?: Sensor): RuntimeStatus {
    const warningThreshold = Number.isFinite(sensor?.warningThreshold as number)
      ? Number(sensor?.warningThreshold)
      : key === 'MQ7'
        ? this.mq7Warning
        : this.mq5Warning;
    const alertThreshold = Number.isFinite(sensor?.alertThreshold as number)
      ? Number(sensor?.alertThreshold)
      : key === 'MQ7'
        ? this.mq7Alert
        : this.mq5Alert;

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
      port: this.mode === 'hardware' ? this.activePortPath || this.comPort : null,
      configuredPort: this.mode === 'hardware' ? this.comPort : null,
      autoDetectPort: this.mode === 'hardware' ? this.autoDetectPort : null,
      baudRate: this.mode === 'hardware' ? this.baudRate : null,
      reconnectMs: this.reconnectMs,
      packetCount: this.packetCount,
      lastPacketAt: this.lastPacketAt?.toISOString() ?? null,
      lastPacketRaw: this.lastPacketRaw,
      lastError: this.lastError,
      startedAt: this.startedAt.toISOString(),
      sensorMapping: this.sensorIdByKey,
      detectedSensors: (Object.keys(this.lastSeenAtByKey) as SensorKey[]).map((key) => ({
        key,
        label: this.lastHardwareLabelByKey[key] || key,
        lastValue: this.lastValueByKey[key] ?? null,
        lastSeenAt: this.lastSeenAtByKey[key]?.toISOString() ?? null,
      })),
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

import { Injectable, NotFoundException, Logger, Inject, forwardRef, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, In } from 'typeorm';
import * as http from 'http';
import * as https from 'https';
import { camera, fire_detection_log, fire_alert_config, hazards, nodes, SensorLog, Sensor } from '@app/entities';
import {
  FireDetectionAlertDto,
  FireDetectionAlertResponseDto,
  FireConfirmedDto,
  CreateFireAlertConfigDto,
  UpdateFireAlertConfigDto,
} from '../dto/fire-detection.dto';
import { FireDetectionGateway, FireDetectionEvent } from '../gateways/fire-detection.gateway';

@Injectable()
export class FireDetectionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FireDetectionService.name);

  // In-memory cache for consecutive detection tracking
  private consecutiveDetections: Map<string, { count: number; lastTimestamp: number }> = new Map();

  // Cache cleanup interval (runs every 60 seconds)
  private cacheCleanupInterval: NodeJS.Timeout | null = null;
  private readonly CACHE_CLEANUP_INTERVAL_MS = 60000; // 1 minute
  private readonly CACHE_ENTRY_TTL_SECONDS = 300; // 5 minutes
  private readonly sensorCameraConfirmWindowSeconds = Number(
    process.env.SENSOR_CAMERA_CONFIRM_WINDOW_SECONDS || 60,
  );

  constructor(
    @InjectRepository(camera)
    private cameraRepository: Repository<camera>,
    @InjectRepository(fire_detection_log)
    private fireDetectionLogRepository: Repository<fire_detection_log>,
    @InjectRepository(fire_alert_config)
    private fireAlertConfigRepository: Repository<fire_alert_config>,
    @InjectRepository(hazards)
    private hazardRepository: Repository<hazards>,
    @InjectRepository(nodes)
    private nodesRepository: Repository<nodes>,
    @InjectRepository(SensorLog)
    private sensorLogRepository: Repository<SensorLog>,
    @InjectRepository(Sensor)
    private sensorRepository: Repository<Sensor>,
    @Inject(forwardRef(() => FireDetectionGateway))
    private readonly fireDetectionGateway: FireDetectionGateway,
  ) {}

  /**
   * Lifecycle hook - start cache cleanup interval on module init
   */
  onModuleInit() {
    this.startCacheCleanup();
    this.logger.log('FireDetectionService initialized with cache cleanup interval');
  }

  /**
   * Lifecycle hook - stop cache cleanup interval on module destroy
   */
  onModuleDestroy() {
    this.stopCacheCleanup();
    this.logger.log('FireDetectionService destroyed, cache cleanup stopped');
  }

  /**
   * Start periodic cache cleanup to remove stale entries
   */
  private startCacheCleanup() {
    this.cacheCleanupInterval = setInterval(() => {
      this.cleanupStaleEntries();
    }, this.CACHE_CLEANUP_INTERVAL_MS);
  }

  /**
   * Stop the cache cleanup interval
   */
  private stopCacheCleanup() {
    if (this.cacheCleanupInterval) {
      clearInterval(this.cacheCleanupInterval);
      this.cacheCleanupInterval = null;
    }
  }

  /**
   * Remove stale entries from consecutive detections cache
   */
  private cleanupStaleEntries() {
    const now = Date.now() / 1000; // Current time in seconds
    let cleanedCount = 0;

    for (const [key, value] of this.consecutiveDetections) {
      if (now - value.lastTimestamp > this.CACHE_ENTRY_TTL_SECONDS) {
        this.consecutiveDetections.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logger.debug(`Cleaned up ${cleanedCount} stale cache entries`);
    }
  }

  /**
   * Process fire detection alert from fire-detect pipeline
   */
  async processAlert(alertDto: FireDetectionAlertDto): Promise<FireDetectionAlertResponseDto> {
    // 1. Find camera by camera_id code
    const cam = await this.cameraRepository.findOne({
      where: { camera_id: alertDto.camera_id },
      relations: ['building', 'floor', 'room'],
    });

    if (!cam) {
      this.logger.warn(`Camera with code '${alertDto.camera_id}' not found`);
      return {
        received: true,
        logged: false,
        alert_triggered: false,
        reason: `Camera with code '${alertDto.camera_id}' not found. Register camera in admin panel first.`,
      };
    }

    // Check if fire detection is enabled for this camera
    if (!cam.is_fire_detection_enabled) {
      return {
        received: true,
        logged: false,
        alert_triggered: false,
        reason: 'Fire detection is disabled for this camera',
      };
    }

    // 2. Get alert config for the building (or use defaults)
    const config = await this.getOrCreateConfig(cam.building_id);

    // 3. Process each detection
    const maxConfidence = Math.max(...alertDto.detections.map((d) => d.score), 0);
    const fireDetections = alertDto.detections.filter((d) => d.label.toLowerCase() === 'fire');

    if (fireDetections.length === 0) {
      return {
        received: true,
        logged: false,
        alert_triggered: false,
        reason: 'No fire detections in payload',
      };
    }

    // 4. Log detection
    const detectionLog = await this.logDetection(cam, alertDto, maxConfidence);

    // 5. Check alert criteria
    const alertResult = await this.checkAlertCriteria(cam, config, maxConfidence, alertDto.timestamp);

    if (alertResult.shouldTrigger) {
      // 6. Mark camera criteria met so the sensor path can find it
      detectionLog.alert_triggered = true;
      await this.fireDetectionLogRepository.save(detectionLog);

      // 7. Check DB-based AND logic: hazard only if sensor also recently alerted
      const hazardId = await this.checkAndLogic(cam.room_id, cam.building_id);

      if (hazardId) {
        this.logger.log(`Fire alert triggered for camera ${cam.camera_id} in building ${cam.building_id}`);
        return {
          received: true,
          logged: true,
          alert_triggered: true,
          hazard_id: hazardId,
          camera: {
            id: cam.id,
            name: cam.name,
            room_id: cam.room_id,
            floor_id: cam.floor_id,
            building_id: cam.building_id,
          },
        };
      }

      this.logger.warn(
        `Camera fire detection for ${cam.camera_id} logged; awaiting sensor confirmation in same location`,
      );
      return {
        received: true,
        logged: true,
        alert_triggered: false,
        reason: 'Camera criteria met, awaiting sensor confirmation',
        camera: {
          id: cam.id,
          name: cam.name,
          room_id: cam.room_id,
          floor_id: cam.floor_id,
          building_id: cam.building_id,
        },
      };
    }

    return {
      received: true,
      logged: true,
      alert_triggered: false,
      reason: alertResult.reason,
      camera: {
        id: cam.id,
        name: cam.name,
        room_id: cam.room_id,
        floor_id: cam.floor_id,
        building_id: cam.building_id,
      },
    };
  }

  /**
   * Log detection to database
   */
  private async logDetection(
    cam: camera,
    alertDto: FireDetectionAlertDto,
    confidence: number,
  ): Promise<fire_detection_log> {
    const maxScoreDetection = alertDto.detections.reduce((max, d) => (d.score > max.score ? d : max));

    const log = this.fireDetectionLogRepository.create({
      camera_id: cam.id,
      camera_code: alertDto.camera_id,
      detection_timestamp: new Date(alertDto.timestamp * 1000),
      confidence: confidence,
      bounding_box: {
        x1: maxScoreDetection.bbox[0],
        y1: maxScoreDetection.bbox[1],
        x2: maxScoreDetection.bbox[2],
        y2: maxScoreDetection.bbox[3],
      },
      inference_latency: alertDto.latency,
      alert_triggered: false,
    });

    return this.fireDetectionLogRepository.save(log);
  }

  /**
   * Check if alert criteria are met
   */
  private async checkAlertCriteria(
    cam: camera,
    config: fire_alert_config,
    confidence: number,
    timestamp: number,
  ): Promise<{ shouldTrigger: boolean; reason?: string }> {
    // Check confidence threshold
    if (confidence < Number(config.min_confidence)) {
      return {
        shouldTrigger: false,
        reason: `Confidence ${confidence.toFixed(4)} below threshold ${config.min_confidence}`,
      };
    }

    // Check cooldown — fire_detection_log.created_at is stored as UTC (DB DEFAULT now()).
    // TypeORM/pg serializes JS Date params in local time, causing a 5h offset on PKT machines.
    // Use raw SQL with NOW() so both sides of the comparison are server-side UTC.
    const cooldownRows: { id: number; created_at: Date }[] = await this.fireDetectionLogRepository.query(
      `SELECT id, created_at FROM fire_detection_log WHERE camera_id = $1 AND alert_triggered = true AND created_at > NOW() - ($2 * INTERVAL '1 second') ORDER BY created_at DESC LIMIT 1`,
      [cam.id, config.cooldown_seconds],
    );

    if (cooldownRows.length > 0) {
      return {
        shouldTrigger: false,
        reason: `Cooldown active`,
      };
    }

    // Check consecutive detections
    const cacheKey = `${cam.camera_id}`;
    const cached = this.consecutiveDetections.get(cacheKey);
    const now = timestamp;

    // Reset count if more than 10 seconds have passed since last detection
    if (!cached || now - cached.lastTimestamp > 10) {
      this.consecutiveDetections.set(cacheKey, { count: 1, lastTimestamp: now });
      if (config.consecutive_detections > 1) {
        return {
          shouldTrigger: false,
          reason: `Consecutive detections: 1/${config.consecutive_detections}`,
        };
      }
    } else {
      const newCount = cached.count + 1;
      this.consecutiveDetections.set(cacheKey, { count: newCount, lastTimestamp: now });

      if (newCount < config.consecutive_detections) {
        return {
          shouldTrigger: false,
          reason: `Consecutive detections: ${newCount}/${config.consecutive_detections}`,
        };
      }

      // Reset count after triggering
      this.consecutiveDetections.delete(cacheKey);
    }

    return { shouldTrigger: true };
  }

  /**
   * DB-based AND logic: returns hazard ID if both a camera detection AND sensor alert
   * have fired in the same location within the confirmation window. Creates the hazard
   * if not already present; emits the fire-detected WebSocket event.
   * Called from both the camera path (processAlert) and the sensor path (handleReading).
   */
  async checkAndLogic(roomId?: number | null, buildingId?: number | null): Promise<number | null> {
    if (!roomId && !buildingId) return null;

    const since = new Date(Date.now() - this.sensorCameraConfirmWindowSeconds * 1000);

    // Step 1: Find cameras in this building/room, then look up recent alert_triggered log
    const cameras = await this.cameraRepository.find({
      where: buildingId ? { building_id: buildingId } : { room_id: roomId! },
      select: ['id'],
    });
    if (cameras.length === 0) return null;

    const cameraIds = cameras.map((c) => c.id);
    const cameraLog = await this.fireDetectionLogRepository.findOne({
      where: {
        camera_id: In(cameraIds),
        alert_triggered: true,
        detection_timestamp: MoreThan(since),
      },
      order: { detection_timestamp: 'DESC' },
    });

    if (!cameraLog) return null;

    // Step 2: Find sensors in this building/room, then look up recent isAlert log.
    // Use raw SQL with NOW() so the comparison is fully server-side:
    // sensor_log.created_at is set by PostgreSQL DEFAULT now() (server UTC),
    // but TypeORM/pg serializes JS Date params in local time — timezone mismatch
    // causes MoreThan(since) to always fail on non-UTC machines.
    const sensors = await this.sensorRepository.find({
      where: buildingId ? { buildingId } : { roomId: roomId! },
      select: ['id'],
    });
    if (sensors.length === 0) return null;

    const sensorIds = sensors.map((s) => s.id);
    const sensorRows: { id: number }[] = await this.sensorLogRepository.query(
      `SELECT id FROM sensor_log WHERE sensor_id = ANY($1) AND is_alert = true AND created_at > NOW() - ($2 * INTERVAL '1 second') ORDER BY created_at DESC LIMIT 1`,
      [sensorIds, this.sensorCameraConfirmWindowSeconds],
    );

    if (sensorRows.length === 0) return null;

    // Both confirmed — fetch camera for hazard creation and duplicate guard
    const cam = await this.cameraRepository.findOne({ where: { id: cameraLog.camera_id } });
    if (!cam) return null;

    if (cam.room_id) {
      // Guard 1: hazard being actively dealt with — return it without re-emitting
      const existing = await this.hazardRepository.findOne({
        where: { roomId: cam.room_id, type: 'fire', status: In(['active', 'pending', 'responded']) },
      });
      if (existing) return existing.id;

      // Guard 2: cooldown — a hazard was already created for this room recently.
      // Prevents spam-creating hazards when the user clears one but conditions still hold.
      // Use raw SQL + NOW() to avoid timezone mismatch (hazards.created_at is DEFAULT now()).
      // Clamp to at least sensorCameraConfirmWindowSeconds so a DB config of 0 can't disable it.
      const config = await this.getOrCreateConfig(cam.building_id);
      const cooldownSecs = Math.max(
        Number(config.cooldown_seconds ?? 60),
        this.sensorCameraConfirmWindowSeconds,
      );
      const recentHazards: { id: number }[] = await this.hazardRepository.query(
        `SELECT id FROM hazards WHERE room_id = $1 AND type = 'fire' AND created_at > NOW() - ($2 * INTERVAL '1 second') LIMIT 1`,
        [cam.room_id, cooldownSecs],
      );
      if (recentHazards.length > 0) {
        this.logger.warn(`[AND] Room ${cam.room_id} in fire-detection cooldown (${cooldownSecs}s), skipping new hazard`);
        return null;
      }
    }

    const hazard = await this.createFireHazard(cam, cameraLog.confidence);

    cameraLog.hazard_id = hazard.id;
    await this.fireDetectionLogRepository.save(cameraLog);

    const severity = cameraLog.confidence >= 0.9 ? 'critical' : cameraLog.confidence >= 0.8 ? 'high' : 'medium';
    const fireEvent: FireDetectionEvent = {
      camera_id: cam.camera_id,
      camera_name: cam.name,
      building_id: cam.building_id,
      floor_id: cam.floor_id ?? undefined,
      room_id: cam.room_id ?? undefined,
      confidence: cameraLog.confidence,
      timestamp: Math.floor(Date.now() / 1000),
      hazard_id: hazard.id,
      severity,
      location_description: cam.location_description ?? undefined,
    };

    this.fireDetectionGateway.emitFireDetected(fireEvent);

    // Forward to deployed BE so its WS clients (e.g. mobile WebView) receive fire.detected.
    // Only runs when DEPLOYED_BACKEND_URL is set (local instance). Deployed BE never has this
    // var set, so there is no forwarding loop.
    void this.forwardFireConfirmedToDeployed(fireEvent).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to forward fire-confirmed to deployed backend: ${msg}`);
    });

    return hazard.id;
  }

  /**
   * Create a fire hazard with location data from camera
   */
  private async createFireHazard(cam: camera, confidence: number): Promise<hazards> {
    const severity = confidence >= 0.9 ? 'critical' : confidence >= 0.8 ? 'high' : 'medium';

    // Resolve node_id: use camera's nodeId, or look up a node in the camera's room
    let nodeId = cam.nodeId ?? undefined;
    if (!nodeId && cam.room_id) {
      const roomNode = await this.nodesRepository.findOne({
        where: { room_id: cam.room_id },
      });
      if (roomNode) {
        nodeId = roomNode.id;
        this.logger.log(`Resolved node_id ${nodeId} from room_id ${cam.room_id} for camera ${cam.camera_id}`);
      } else {
        this.logger.warn(`No node found for room_id ${cam.room_id} (camera ${cam.camera_id}) - hazard will have no node_id`);
      }
    }

    const hazard = this.hazardRepository.create({
      type: 'fire',
      severity: severity,
      status: 'active',
      description: `Fire detected by camera ${cam.name} (${cam.camera_id}) with ${(confidence * 100).toFixed(1)}% confidence`,
      // Include location data from camera for evacuation routing
      roomId: cam.room_id ?? undefined,
      floorId: cam.floor_id ?? undefined,
      nodeId: nodeId,
    });

    return this.hazardRepository.save(hazard);
  }

  /**
   * Get or create fire alert config for building
   */
  async getOrCreateConfig(buildingId: number): Promise<fire_alert_config> {
    let config = await this.fireAlertConfigRepository.findOne({
      where: { building_id: buildingId },
    });

    if (!config) {
      // Create default config
      config = this.fireAlertConfigRepository.create({
        building_id: buildingId,
        min_confidence: 0.4,
        consecutive_detections: 3,
        cooldown_seconds: 60,
        auto_create_hazard: true,
        auto_notify_firefighters: true,
      });
      config = await this.fireAlertConfigRepository.save(config);
    }

    return config;
  }

  /**
   * Get fire alert config for building
   */
  async getConfig(buildingId: number): Promise<fire_alert_config> {
    const config = await this.fireAlertConfigRepository.findOne({
      where: { building_id: buildingId },
      relations: ['building'],
    });
    if (!config) {
      throw new NotFoundException(`Fire alert config for building ${buildingId} not found`);
    }
    return config;
  }

  /**
   * Create fire alert config
   */
  async createConfig(dto: CreateFireAlertConfigDto): Promise<fire_alert_config> {
    const config = this.fireAlertConfigRepository.create({
      building_id: dto.building_id,
      min_confidence: dto.min_confidence ?? 0.4,
      consecutive_detections: dto.consecutive_detections ?? 3,
      cooldown_seconds: dto.cooldown_seconds ?? 60,
      auto_create_hazard: dto.auto_create_hazard ?? true,
      auto_notify_firefighters: dto.auto_notify_firefighters ?? true,
    });
    return this.fireAlertConfigRepository.save(config);
  }

  /**
   * Update fire alert config
   */
  async updateConfig(buildingId: number, dto: UpdateFireAlertConfigDto): Promise<fire_alert_config> {
    const config = await this.getConfig(buildingId);
    Object.assign(config, dto);
    return this.fireAlertConfigRepository.save(config);
  }

  /**
   * Get detection logs for a camera
   */
  async getDetectionLogs(cameraId: number, limit = 100) {
    return this.fireDetectionLogRepository.find({
      where: { camera_id: cameraId },
      order: { detection_timestamp: 'DESC' },
      take: limit,
    });
  }

  /**
   * Get recent detections for a building
   */
  async getRecentDetections(buildingId: number, hours = 24) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    return this.fireDetectionLogRepository
      .createQueryBuilder('log')
      .innerJoin('camera', 'cam', 'cam.id = log.camera_id')
      .where('cam.building_id = :buildingId', { buildingId })
      .andWhere('log.detection_timestamp > :since', { since })
      .orderBy('log.detection_timestamp', 'DESC')
      .getMany();
  }

  /**
   * Receive a fire-confirmed event forwarded from a local ignis-BE instance.
   * Just emits fire.detected on this instance's WS — no DB writes, no further forwarding.
   */
  receiveFireConfirmed(dto: FireConfirmedDto): void {
    this.fireDetectionGateway.emitFireDetected({
      camera_id: dto.camera_id,
      camera_name: dto.camera_name ?? dto.camera_id,
      building_id: dto.building_id,
      floor_id: dto.floor_id,
      room_id: dto.room_id,
      confidence: dto.confidence,
      timestamp: dto.timestamp,
      hazard_id: dto.hazard_id,
      severity: dto.severity,
      location_description: dto.location_description,
    });
  }

  /**
   * POST the fire-confirmed event to the deployed backend so its WS clients receive it.
   */
  private async forwardFireConfirmedToDeployed(event: FireDetectionEvent): Promise<void> {
    const deployedUrl = process.env.DEPLOYED_BACKEND_URL;
    if (!deployedUrl) return;

    const apiKey = process.env.FIRE_DETECT_API_KEY;
    await this.postJsonForward(`${deployedUrl}/fire-detection/fire-confirmed`, event, apiKey);
    this.logger.log(
      `Forwarded fire-confirmed to deployed backend (building=${event.building_id}, room=${event.room_id ?? 'n/a'})`,
    );
  }

  private async postJsonForward(urlStr: string, data: any, apiKey?: string): Promise<void> {
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
              reject(new Error(`fire-confirmed forward failed: ${res.statusCode} ${body}`));
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

  /**
   * Get detection stats
   */
  async getDetectionStats(buildingId?: number) {
    const query = this.fireDetectionLogRepository.createQueryBuilder('log');

    if (buildingId) {
      query.innerJoin('camera', 'cam', 'cam.id = log.camera_id').where('cam.building_id = :buildingId', { buildingId });
    }

    const total = await query.getCount();
    const alertsTriggered = await query.clone().andWhere('log.alert_triggered = true').getCount();

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const detectionsToday = await query.clone().andWhere('log.detection_timestamp >= :today', { today }).getCount();

    return {
      total,
      alertsTriggered,
      detectionsToday,
      alertRate: total > 0 ? ((alertsTriggered / total) * 100).toFixed(2) + '%' : '0%',
    };
  }
}

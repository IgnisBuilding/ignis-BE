import { Injectable, NotFoundException, Logger, Inject, forwardRef, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { camera, fire_detection_log, fire_alert_config, hazards } from '@app/entities';
import {
  FireDetectionAlertDto,
  FireDetectionAlertResponseDto,
  CreateFireAlertConfigDto,
  UpdateFireAlertConfigDto,
} from '../dto/fire-detection.dto';
import { FireDetectionGateway } from '../gateways/fire-detection.gateway';

@Injectable()
export class FireDetectionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FireDetectionService.name);

  // In-memory cache for consecutive detection tracking
  private consecutiveDetections: Map<string, { count: number; lastTimestamp: number }> = new Map();

  // Cache cleanup interval (runs every 60 seconds)
  private cacheCleanupInterval: NodeJS.Timeout | null = null;
  private readonly CACHE_CLEANUP_INTERVAL_MS = 60000; // 1 minute
  private readonly CACHE_ENTRY_TTL_SECONDS = 300; // 5 minutes

  constructor(
    @InjectRepository(camera)
    private cameraRepository: Repository<camera>,
    @InjectRepository(fire_detection_log)
    private fireDetectionLogRepository: Repository<fire_detection_log>,
    @InjectRepository(fire_alert_config)
    private fireAlertConfigRepository: Repository<fire_alert_config>,
    @InjectRepository(hazards)
    private hazardRepository: Repository<hazards>,
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
      // 6. Create hazard if configured
      let hazardId: number | undefined;
      if (config.auto_create_hazard) {
        const hazard = await this.createFireHazard(cam, maxConfidence);
        hazardId = hazard.id;

        // Update detection log with hazard reference
        detectionLog.alert_triggered = true;
        detectionLog.hazard_id = hazardId;
        await this.fireDetectionLogRepository.save(detectionLog);
      }

      this.logger.log(`Fire alert triggered for camera ${cam.camera_id} in building ${cam.building_id}`);

      // Emit WebSocket event to connected clients
      const severity = maxConfidence >= 0.9 ? 'critical' : maxConfidence >= 0.8 ? 'high' : 'medium';
      this.fireDetectionGateway.emitFireDetected({
        camera_id: cam.camera_id,
        camera_name: cam.name,
        building_id: cam.building_id,
        floor_id: cam.floor_id ?? undefined,
        room_id: cam.room_id ?? undefined,
        confidence: maxConfidence,
        timestamp: alertDto.timestamp,
        hazard_id: hazardId,
        severity,
        location_description: cam.location_description ?? undefined,
      });

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

    // Check cooldown - if there was a recent alert, don't trigger again
    const cooldownTime = new Date(Date.now() - config.cooldown_seconds * 1000);
    const recentAlert = await this.fireDetectionLogRepository.findOne({
      where: {
        camera_id: cam.id,
        alert_triggered: true,
        created_at: MoreThan(cooldownTime),
      },
      order: { created_at: 'DESC' },
    });

    if (recentAlert) {
      return {
        shouldTrigger: false,
        reason: `Cooldown active - last alert was ${Math.round((Date.now() - recentAlert.created_at.getTime()) / 1000)}s ago`,
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
   * Create a fire hazard with location data from camera
   */
  private async createFireHazard(cam: camera, confidence: number): Promise<hazards> {
    const severity = confidence >= 0.9 ? 'critical' : confidence >= 0.8 ? 'high' : 'medium';

    const hazard = this.hazardRepository.create({
      type: 'fire',
      severity: severity,
      status: 'active',
      description: `Fire detected by camera ${cam.name} (${cam.camera_id}) with ${(confidence * 100).toFixed(1)}% confidence`,
      // Include location data from camera for evacuation routing
      roomId: cam.room_id ?? undefined,
      floorId: cam.floor_id ?? undefined,
      nodeId: cam.nodeId ?? undefined,
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
        min_confidence: 0.7,
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
      min_confidence: dto.min_confidence ?? 0.7,
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

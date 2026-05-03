import { Injectable, NotFoundException, Logger, Inject, forwardRef, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
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

  // Per-location throttle for fire.detected WS emits.  Even when AND logic legitimately
  // produces a new hazard, never re-emit fire.detected for the same room/floor within
  // FIRE_DETECTED_EMIT_THROTTLE_MS — the mobile app's FireAlertService plays a 5-second
  // alarm on every event with no debounce, so back-to-back emits create the
  // "continuous alarm" symptom even when hazards are actually distinct.
  private lastFireEmitByLocation: Map<string, number> = new Map();
  private readonly FIRE_DETECTED_EMIT_THROTTLE_MS = Number(
    process.env.FIRE_DETECTED_EMIT_THROTTLE_MS || 30000, // 30s
  );

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

    const callTag = `[AND room=${roomId ?? '-'} bld=${buildingId ?? '-'}]`;

    // Resolve buildingId from roomId if only roomId was given.  Without this, downstream
    // building-level queries (active-hazard hard guard, sensor/camera lookups) silently
    // fall back to room-only filters and miss records that have buildingId but not roomId.
    // room.floor_id → floor.building_id chain — room itself has no building_id column.
    let effectiveBuildingId: number | null | undefined = buildingId;
    if (!effectiveBuildingId && roomId) {
      const buildingRows: { building_id: number }[] = await this.cameraRepository.query(
        `SELECT f.building_id FROM room r JOIN floor f ON f.id = r.floor_id WHERE r.id = $1 LIMIT 1`,
        [roomId],
      );
      effectiveBuildingId = buildingRows?.[0]?.building_id ?? null;
    }

    // ── HARD GUARD ──────────────────────────────────────────────────────
    // If ANY active fire hazard already exists in this building, return its id and do
    // NOT create a new hazard.  This is the top-level safety net: it doesn't matter how
    // sloppy the room/floor/node linkage is on cameras, sensors, or hazards — while a
    // building has an unresolved fire, sensor ticks must not spawn new ones.  Catches
    // every gap in Guard 1 / Guard 2 below (NULL room_id, NULL floor_id, missing node_id).
    if (effectiveBuildingId) {
      const activeBuildingHazards: { id: number }[] = await this.hazardRepository.query(
        `SELECT h.id
         FROM hazards h
         LEFT JOIN room r ON r.id = h.room_id
         LEFT JOIN floor f_room ON f_room.id = r.floor_id
         LEFT JOIN floor f_haz ON f_haz.id = h.floor_id
         LEFT JOIN nodes n ON n.id = h.node_id
         LEFT JOIN floor f_node ON f_node.id = n.floor_id
         WHERE h.type = 'fire'
           AND h.status IN ('active', 'pending', 'responded')
           AND (
             f_room.building_id = $1
             OR f_haz.building_id = $1
             OR f_node.building_id = $1
           )
         ORDER BY h.created_at DESC
         LIMIT 1`,
        [effectiveBuildingId],
      );
      if (activeBuildingHazards.length > 0) {
        this.logger.log(
          `${callTag} active fire hazard ${activeBuildingHazards[0].id} already exists in building ${effectiveBuildingId} → returning existing, NOT emitting`,
        );
        return activeBuildingHazards[0].id;
      }
    }

    // Step 1: Find cameras in this building/room, then look up the most-recent camera log
    // that is armed (alert_triggered=true) but has NOT yet created a hazard (hazard_id IS NULL).
    // Use OR-based filter (room OR building) so cameras with only roomId or only buildingId
    // populated are both found.  Strict {buildingId: X} would miss cameras that have only
    // roomId set, and vice versa.
    const cameraWhere: any[] = [];
    if (roomId) cameraWhere.push({ room_id: roomId });
    if (effectiveBuildingId) cameraWhere.push({ building_id: effectiveBuildingId });
    const cameras = await this.cameraRepository.find({
      where: cameraWhere,
      select: ['id'],
    });
    if (cameras.length === 0) {
      this.logger.debug(`${callTag} no cameras for location → skip`);
      return null;
    }

    const cameraIds = cameras.map((c) => c.id);
    // CRITICAL: use created_at (server-side, set by PG DEFAULT now()) NOT detection_timestamp
    // (client-side, comes from the Python pipeline's clock).  detection_timestamp is
    // vulnerable to clock skew between the fire-detect pipeline machine and the BE/DB,
    // and in `timestamp without time zone` columns the pg driver drops the offset.
    // Freshness checks must compare server-set columns to server NOW().
    const cameraLogRows: { id: number; camera_id: number; confidence: number }[] =
      await this.fireDetectionLogRepository.query(
        `SELECT id, camera_id, confidence
         FROM fire_detection_log
         WHERE camera_id = ANY($1)
           AND alert_triggered = true
           AND hazard_id IS NULL
           AND created_at > NOW() - ($2 * INTERVAL '1 second')
         ORDER BY created_at DESC
         LIMIT 1`,
        [cameraIds, this.sensorCameraConfirmWindowSeconds],
      );

    if (cameraLogRows.length === 0) {
      this.logger.log(
        `${callTag} no armed camera log (alert_triggered=true AND hazard_id IS NULL within ${this.sensorCameraConfirmWindowSeconds}s of NOW server-time) → skip`,
      );
      return null;
    }

    const { id: cameraLogId, camera_id: cameraLogCameraId, confidence: cameraLogConfidence } = cameraLogRows[0];
    this.logger.log(
      `${callTag} found armed camera log id=${cameraLogId} cam=${cameraLogCameraId} conf=${cameraLogConfidence}`,
    );

    // Step 2: Find sensors in this building/room, then look up recent isAlert log.
    // Use OR-based filter (room OR building) — same rationale as the camera query above.
    // A sensor created via Map Editor often has roomId but no buildingId (or vice versa);
    // the strict-AND form was missing rows and producing the false "awaiting sensor
    // confirmation" response even when sensor_log clearly had is_alert=true rows.
    // Use raw SQL with NOW() for the time check to avoid TypeORM/pg local-time
    // serialization clashing with PostgreSQL UTC.
    const sensorWhere: any[] = [];
    if (roomId) sensorWhere.push({ roomId });
    if (effectiveBuildingId) sensorWhere.push({ buildingId: effectiveBuildingId });
    const sensors = await this.sensorRepository.find({
      where: sensorWhere,
      select: ['id'],
    });
    if (sensors.length === 0) {
      this.logger.warn(
        `${callTag} no sensors found for location — sensor_agent readings cannot match. Check sensor.roomId/buildingId in DB.`,
      );
      return null;
    }
    this.logger.log(`${callTag} matched ${sensors.length} sensor(s) for location`);

    const sensorIds = sensors.map((s) => s.id);
    const sensorRows: { id: number }[] = await this.sensorLogRepository.query(
      `SELECT id FROM sensor_log WHERE sensor_id = ANY($1) AND is_alert = true AND created_at > NOW() - ($2 * INTERVAL '1 second') ORDER BY created_at DESC LIMIT 1`,
      [sensorIds, this.sensorCameraConfirmWindowSeconds],
    );

    if (sensorRows.length === 0) {
      this.logger.log(`${callTag} no recent sensor alert → skip`);
      return null;
    }

    // Both confirmed — fetch camera for hazard creation and duplicate guards.
    const cam = await this.cameraRepository.findOne({ where: { id: cameraLogCameraId } });
    if (!cam) {
      this.logger.warn(`${callTag} camera id=${cameraLogCameraId} not found → skip`);
      return null;
    }

    // Hard refusal: a camera with no room_id will produce a hazard with NULL room_id,
    // which the FE map cannot render and which would make mobile clients alarm with
    // no visible cause.  Disarm the log and skip — better to lose this trigger than
    // produce a phantom alarm.  The fire-detect operator should fix the camera's
    // room_id; consume the log so it doesn't keep matching on every sensor tick.
    if (cam.room_id == null) {
      await this.fireDetectionLogRepository.query(
        `UPDATE fire_detection_log SET alert_triggered = false WHERE id = $1`,
        [cameraLogId],
      );
      this.logger.warn(
        `${callTag} camera ${cam.camera_id} (id=${cam.id}, name='${cam.name}') has NULL room_id — refusing to create roomless hazard, disarmed log ${cameraLogId}`,
      );
      return null;
    }

    const config = await this.getOrCreateConfig(cam.building_id);
    const cooldownSecs = Math.max(
      Number(config.cooldown_seconds ?? 60),
      this.sensorCameraConfirmWindowSeconds,
    );

    // Guard 1: an active/pending/responded hazard already exists — return it without
    // re-emitting fire.detected.  Also consume the camera log (set hazard_id) so it
    // cannot re-trigger a NEW hazard once the current one is eventually cleared.
    // Works for cameras with or without a room_id (falls back to floor_id).
    let existingHazard: hazards | null = null;
    if (cam.room_id) {
      existingHazard = await this.hazardRepository.findOne({
        where: { roomId: cam.room_id, type: 'fire', status: In(['active', 'pending', 'responded']) },
      });
    } else if (cam.floor_id) {
      existingHazard = await this.hazardRepository.findOne({
        where: { floorId: cam.floor_id, type: 'fire', status: In(['active', 'pending', 'responded']) },
      });
    }

    if (existingHazard) {
      // Consume the log so it cannot arm a second hazard after this one is cleared
      await this.fireDetectionLogRepository.query(
        `UPDATE fire_detection_log SET hazard_id = $1 WHERE id = $2`,
        [existingHazard.id, cameraLogId],
      );
      this.logger.log(
        `${callTag} active hazard ${existingHazard.id} already exists → consumed log ${cameraLogId}, NOT emitting fire.detected`,
      );
      return existingHazard.id;
    }

    // Guard 2: cooldown — a hazard was already created recently for this location.
    // Prevents spam-creating hazards when the user clears one but conditions still hold.
    // Use raw SQL + NOW() to avoid timezone mismatch (hazards.created_at is DEFAULT now()).
    // Cameras without room_id fall back to a building-level check via node→floor join.
    let recentHazards: { id: number }[];
    if (cam.room_id) {
      recentHazards = await this.hazardRepository.query(
        `SELECT id FROM hazards WHERE room_id = $1 AND type = 'fire' AND created_at > NOW() - ($2 * INTERVAL '1 second') LIMIT 1`,
        [cam.room_id, cooldownSecs],
      );
    } else {
      recentHazards = await this.hazardRepository.query(
        `SELECT h.id FROM hazards h
         JOIN nodes n ON n.id = h.node_id
         JOIN floor f ON n.floor_id = f.id
         WHERE f.building_id = $1 AND h.type = 'fire'
         AND h.created_at > NOW() - ($2 * INTERVAL '1 second')
         LIMIT 1`,
        [cam.building_id, cooldownSecs],
      );
    }

    if (recentHazards.length > 0) {
      // Cooldown active — also consume this log so we don't keep scanning it on every tick.
      // Without this, the same log keeps matching the camera-log query each sensor tick,
      // wasting cycles and risking re-emit if the cooldown happens to expire mid-test.
      await this.fireDetectionLogRepository.query(
        `UPDATE fire_detection_log SET alert_triggered = false WHERE id = $1`,
        [cameraLogId],
      );
      this.logger.warn(
        `${callTag} cooldown active (${cooldownSecs}s, recent hazard exists) → disarmed log ${cameraLogId}, skipping new hazard`,
      );
      return null;
    }

    // Per-location WS throttle: if we just emitted fire.detected for this room/floor very
    // recently, don't emit again even though we're about to create a new hazard.
    // The hazard still gets created (so the map auto-place flow works) but the alarm
    // sound won't re-trigger on mobile within the throttle window.
    const locationKey = cam.room_id ? `r:${cam.room_id}` : cam.floor_id ? `f:${cam.floor_id}` : `b:${cam.building_id}`;
    const lastEmit = this.lastFireEmitByLocation.get(locationKey) ?? 0;
    const sinceLastEmit = Date.now() - lastEmit;

    const hazard = await this.createFireHazard(cam, cameraLogConfidence);

    // Consume the camera log — mark it as used so future checkAndLogic calls skip it
    await this.fireDetectionLogRepository.query(
      `UPDATE fire_detection_log SET hazard_id = $1 WHERE id = $2`,
      [hazard.id, cameraLogId],
    );

    if (sinceLastEmit < this.FIRE_DETECTED_EMIT_THROTTLE_MS) {
      this.logger.warn(
        `${callTag} hazard ${hazard.id} created but fire.detected emit throttled (${sinceLastEmit}ms < ${this.FIRE_DETECTED_EMIT_THROTTLE_MS}ms since last emit at ${locationKey})`,
      );
      return hazard.id;
    }
    this.lastFireEmitByLocation.set(locationKey, Date.now());

    const severity = cameraLogConfidence >= 0.9 ? 'critical' : cameraLogConfidence >= 0.8 ? 'high' : 'medium';
    const fireEvent: FireDetectionEvent = {
      camera_id: cam.camera_id,
      camera_name: cam.name,
      building_id: cam.building_id,
      floor_id: cam.floor_id ?? undefined,
      room_id: cam.room_id ?? undefined,
      confidence: cameraLogConfidence,
      timestamp: Math.floor(Date.now() / 1000),
      hazard_id: hazard.id,
      severity,
      location_description: cam.location_description ?? undefined,
    };

    this.logger.log(
      `${callTag} EMITTING fire.detected hazard=${hazard.id} cam='${cam.name}' (${cam.camera_id}) sev=${severity} conf=${cameraLogConfidence}`,
    );
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
   * Reset detection state after a Clear All — called by clearFires endpoint.
   * Clears the in-memory consecutiveDetections cache and resets alert_triggered in the
   * DB for any camera logs created in the last 10 minutes.  The DB reset removes
   * the "armed" flag so checkAndLogic cannot immediately re-fire on the next sensor
   * tick; the cache reset forces the camera pipeline to rebuild 3 consecutive
   * detections from scratch before it can re-arm.
   */
  async resetDetectionCache(): Promise<void> {
    this.consecutiveDetections.clear();
    // Also clear the per-location fire.detected emit throttle so a genuine fire AFTER
    // Clear All can re-alarm immediately (don't wait for the 30s throttle to expire).
    this.lastFireEmitByLocation.clear();
    this.logger.log('Consecutive detections cache + fire emit throttle cleared (triggered by Clear All)');
  }

  /**
   * Invalidate pending ("armed") camera detection logs for a building or room.
   * Called when sensor thresholds are updated so that stale logs from a previous
   * fire-detect session cannot immediately trigger a hazard the moment the new
   * lower threshold is crossed on the next sensor tick.
   */
  async invalidatePendingCameraLogs(buildingId?: number | null, roomId?: number | null): Promise<void> {
    if (roomId) {
      await this.fireDetectionLogRepository.query(
        `UPDATE fire_detection_log SET alert_triggered = false
         WHERE camera_id IN (SELECT id FROM camera WHERE room_id = $1)
           AND alert_triggered = true
           AND hazard_id IS NULL`,
        [roomId],
      );
    } else if (buildingId) {
      await this.fireDetectionLogRepository.query(
        `UPDATE fire_detection_log SET alert_triggered = false
         WHERE camera_id IN (SELECT id FROM camera WHERE building_id = $1)
           AND alert_triggered = true
           AND hazard_id IS NULL`,
        [buildingId],
      );
    }
    this.logger.log(`Pending camera logs invalidated (buildingId=${buildingId}, roomId=${roomId}) — threshold update`);
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

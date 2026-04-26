import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  Alert,
  Sensor,
  Society,
  User,
  apartment,
  building,
  camera,
  fire_detection_log,
  floor,
  hazards,
} from '@app/entities';
import {
  ActiveAlertsResult,
  ActiveHazardsContextResult,
  ApartmentInfoResult,
  BuildingInfoResult,
  CamerasForBuildingResult,
  HazardActionResult,
  RecentDetectionsResult,
  RiskSummaryResult,
  SensorStatsResult,
  SensorsForBuildingResult,
  SocietyOverviewResult,
} from './mcp.types';

type ToolArgs = Record<string, unknown> | undefined;

@Injectable()
export class McpToolsService {
  constructor(
    @InjectRepository(hazards)
    private readonly hazardRepository: Repository<hazards>,
    @InjectRepository(Sensor)
    private readonly sensorRepository: Repository<Sensor>,
    @InjectRepository(fire_detection_log)
    private readonly fireDetectionLogRepository: Repository<fire_detection_log>,
    @InjectRepository(building)
    private readonly buildingRepository: Repository<building>,
    @InjectRepository(floor)
    private readonly floorRepository: Repository<floor>,
    @InjectRepository(apartment)
    private readonly apartmentRepository: Repository<apartment>,
    @InjectRepository(camera)
    private readonly cameraRepository: Repository<camera>,
    @InjectRepository(Alert)
    private readonly alertRepository: Repository<Alert>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Society)
    private readonly societyRepository: Repository<Society>,
  ) {}

  // ── Private resolvers ────────────────────────────────────────────────────

  private async resolveBuilding(name: string): Promise<building | null> {
    return this.buildingRepository
      .createQueryBuilder('b')
      .where('LOWER(b.name) LIKE :name', { name: `%${name.toLowerCase().trim()}%` })
      .orderBy('b.id', 'ASC')
      .getOne();
  }

  private async resolveSociety(name: string): Promise<Society | null> {
    return this.societyRepository
      .createQueryBuilder('s')
      .where('LOWER(s.name) LIKE :name', { name: `%${name.toLowerCase().trim()}%` })
      .orderBy('s.id', 'ASC')
      .getOne();
  }

  private async resolveFloorId(buildingId: number, level: number): Promise<number | null> {
    const f = await this.floorRepository.findOne({ where: { building_id: buildingId, level } });
    return f?.id ?? null;
  }

  // ── Tool registration ────────────────────────────────────────────────────

  registerTools(server: McpServer): void {
    server.registerTool(
      'query_risk_summary',
      {
        description:
          'Get aggregate hazard and sensor counts (total, active, resolved, alert sensors) for one building or all buildings. Use when the user asks for an overall risk overview, risk count, or how many active hazards exist.',
        inputSchema: { buildingId: z.number().int().positive().optional() },
      },
      async ({ buildingId }) => {
        const data = await this.queryRiskSummary({ buildingId });
        return { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data as unknown as Record<string, unknown> };
      },
    );

    server.registerTool(
      'get_active_hazards_context',
      {
        description:
          'Return a list of active, pending, and responding hazards with type, severity, status, and timestamps. Use when the user asks what hazards are active, what is currently on fire, or what emergencies are ongoing.',
        inputSchema: {
          buildingId: z.number().int().positive().optional(),
          limit: z.number().int().positive().max(100).optional(),
        },
      },
      async ({ buildingId, limit }) => {
        const data = await this.getActiveHazardsContext({ buildingId, limit });
        return { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data as unknown as Record<string, unknown> };
      },
    );

    server.registerTool(
      'get_recent_fire_detections',
      {
        description:
          'Return recent camera-based fire detection events with confidence scores and timestamps. Use when the user asks about recent fire detections, camera events, or detection history.',
        inputSchema: {
          limit: z.number().int().positive().max(100).optional(),
          buildingName: z.string().optional(),
        },
      },
      async ({ limit, buildingName }) => {
        const data = await this.getRecentFireDetections({ limit, buildingName });
        return { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data as unknown as Record<string, unknown> };
      },
    );

    server.registerTool(
      'get_building_info',
      {
        description:
          'Get structural details for a building: address, building type, floor count, and floor plan availability. Use when the user asks about a building by name or wants to know its physical details.',
        inputSchema: { buildingName: z.string() },
      },
      async ({ buildingName }) => {
        const data = await this.getBuildingInfo(buildingName);
        return { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data as unknown as Record<string, unknown> };
      },
    );

    server.registerTool(
      'get_sensors_for_building',
      {
        description:
          'Return all sensors (or filtered by type: smoke, gas, heat) for a named building, including status, last reading value, and unit. Use when the user asks about sensor status, smoke detectors, gas sensors, or heat sensors in a specific building.',
        inputSchema: {
          buildingName: z.string(),
          sensorType: z.string().optional(),
        },
      },
      async ({ buildingName, sensorType }) => {
        const data = await this.getSensorsForBuilding(buildingName, sensorType);
        return { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data as unknown as Record<string, unknown> };
      },
    );

    server.registerTool(
      'get_cameras_for_building',
      {
        description:
          'Return surveillance cameras and their fire-detection status for a named building. Use when the user asks about cameras, surveillance, or which cameras have fire detection enabled.',
        inputSchema: { buildingName: z.string() },
      },
      async ({ buildingName }) => {
        const data = await this.getCamerasForBuilding(buildingName);
        return { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data as unknown as Record<string, unknown> };
      },
    );

    server.registerTool(
      'get_apartment_info',
      {
        description:
          'Return apartment/unit details including floor level, occupancy status, and owner contact information. Use when the user asks who lives in a unit, about apartment ownership, or needs to reach a resident.',
        inputSchema: {
          buildingName: z.string(),
          unitNumber: z.string(),
        },
      },
      async ({ buildingName, unitNumber }) => {
        const data = await this.getApartmentInfo(buildingName, unitNumber);
        return { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data as unknown as Record<string, unknown> };
      },
    );

    server.registerTool(
      'get_active_alerts',
      {
        description:
          'Return currently active system alerts with severity and description, system-wide or for a specific building. Use when the user asks about current alerts, alarms, or system warnings.',
        inputSchema: { buildingName: z.string().optional() },
      },
      async ({ buildingName }) => {
        const data = await this.getActiveAlerts(buildingName);
        return { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data as unknown as Record<string, unknown> };
      },
    );

    server.registerTool(
      'get_society_overview',
      {
        description:
          'Return a summary of a residential society/complex: building count, and per-building active hazard and alert sensor counts. Use when the user asks about a society, gated community, or residential complex.',
        inputSchema: { societyName: z.string() },
      },
      async ({ societyName }) => {
        const data = await this.getSocietyOverview(societyName);
        return { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data as unknown as Record<string, unknown> };
      },
    );

    server.registerTool(
      'get_building_sensor_stats',
      {
        description:
          'Return a count breakdown of sensors by status (active, alert, inactive) for a named building. Use when the user wants a quick sensor health summary without individual sensor details.',
        inputSchema: { buildingName: z.string() },
      },
      async ({ buildingName }) => {
        const data = await this.getBuildingSensorStats(buildingName);
        return { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data as unknown as Record<string, unknown> };
      },
    );

    server.registerTool(
      'respond_to_hazard',
      {
        description:
          'Mark the most recent active or pending hazard in a building as "responding". Use when a responder says they are on their way to, or are responding to, a fire or hazard at a location.',
        inputSchema: {
          buildingName: z.string(),
          hazardType: z.string().optional(),
          floorNumber: z.number().int().optional(),
        },
      },
      async ({ buildingName, hazardType, floorNumber }) => {
        const data = await this.respondToHazard(buildingName, hazardType, floorNumber);
        return { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data as unknown as Record<string, unknown> };
      },
    );

    server.registerTool(
      'resolve_hazard',
      {
        description:
          'Mark the most recent active, pending, or responding hazard in a building as "resolved". Use when the user says a fire or hazard has been extinguished, cleared, or resolved.',
        inputSchema: {
          buildingName: z.string(),
          hazardType: z.string().optional(),
          floorNumber: z.number().int().optional(),
        },
      },
      async ({ buildingName, hazardType, floorNumber }) => {
        const data = await this.resolveHazard(buildingName, hazardType, floorNumber);
        return { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data as unknown as Record<string, unknown> };
      },
    );
  }

  // ── executeTool dispatcher ───────────────────────────────────────────────

  async executeTool(toolName: string, args?: ToolArgs): Promise<unknown> {
    if (toolName === 'query_risk_summary')
      return this.queryRiskSummary(args as { buildingId?: number } | undefined);

    if (toolName === 'get_active_hazards_context')
      return this.getActiveHazardsContext(args as { buildingId?: number; limit?: number } | undefined);

    if (toolName === 'get_recent_fire_detections')
      return this.getRecentFireDetections(args as { limit?: number; buildingName?: string } | undefined);

    if (toolName === 'get_building_info')
      return this.getBuildingInfo((args as { buildingName: string }).buildingName);

    if (toolName === 'get_sensors_for_building')
      return this.getSensorsForBuilding(
        (args as { buildingName: string; sensorType?: string }).buildingName,
        (args as { buildingName: string; sensorType?: string }).sensorType,
      );

    if (toolName === 'get_cameras_for_building')
      return this.getCamerasForBuilding((args as { buildingName: string }).buildingName);

    if (toolName === 'get_apartment_info')
      return this.getApartmentInfo(
        (args as { buildingName: string; unitNumber: string }).buildingName,
        (args as { buildingName: string; unitNumber: string }).unitNumber,
      );

    if (toolName === 'get_active_alerts')
      return this.getActiveAlerts((args as { buildingName?: string })?.buildingName);

    if (toolName === 'get_society_overview')
      return this.getSocietyOverview((args as { societyName: string }).societyName);

    if (toolName === 'get_building_sensor_stats')
      return this.getBuildingSensorStats((args as { buildingName: string }).buildingName);

    if (toolName === 'respond_to_hazard')
      return this.respondToHazard(
        (args as { buildingName: string; hazardType?: string; floorNumber?: number }).buildingName,
        (args as { buildingName: string; hazardType?: string; floorNumber?: number }).hazardType,
        (args as { buildingName: string; hazardType?: string; floorNumber?: number }).floorNumber,
      );

    if (toolName === 'resolve_hazard')
      return this.resolveHazard(
        (args as { buildingName: string; hazardType?: string; floorNumber?: number }).buildingName,
        (args as { buildingName: string; hazardType?: string; floorNumber?: number }).hazardType,
        (args as { buildingName: string; hazardType?: string; floorNumber?: number }).floorNumber,
      );

    throw new Error(`Unknown MCP tool: ${toolName}`);
  }

  // ── Existing tool implementations ────────────────────────────────────────

  async queryRiskSummary(args?: { buildingId?: number }): Promise<RiskSummaryResult> {
    const buildingId = args?.buildingId;
    const hazardWhere = buildingId ? { floor: { building_id: buildingId } } : {};
    const sensorWhere = buildingId ? { buildingId } : {};

    const [totalHazards, activeHazards, resolvedHazards, activeSensors, alertSensors] =
      await Promise.all([
        this.hazardRepository.count({ where: hazardWhere }),
        this.hazardRepository.count({ where: { ...hazardWhere, status: 'active' } }),
        this.hazardRepository.count({ where: { ...hazardWhere, status: 'resolved' } }),
        this.sensorRepository.count({ where: { ...sensorWhere, status: 'active' } }),
        this.sensorRepository.count({ where: { ...sensorWhere, status: 'alert' } }),
      ]);

    return { totalHazards, activeHazards, resolvedHazards, activeSensors, alertSensors, generatedAt: new Date().toISOString() };
  }

  async getActiveHazardsContext(args?: { buildingId?: number; limit?: number }): Promise<ActiveHazardsContextResult> {
    const limit = args?.limit ?? 20;
    const qb = this.hazardRepository
      .createQueryBuilder('hazard')
      .where('hazard.status IN (:...statuses)', { statuses: ['active', 'responded', 'pending'] })
      .orderBy('hazard.created_at', 'DESC')
      .take(limit);

    if (args?.buildingId)
      qb.leftJoin('hazard.floor', 'floor').andWhere('floor.building_id = :buildingId', { buildingId: args.buildingId });

    const rows = await qb.getMany();
    return {
      hazards: rows.map((h) => ({
        id: h.id, type: h.type, severity: h.severity, status: h.status,
        createdAt: h.created_at.toISOString(), apartmentId: h.apartmentId ?? undefined,
        roomId: h.roomId ?? undefined, floorId: h.floorId ?? undefined,
      })),
      count: rows.length,
    };
  }

  async getRecentFireDetections(args?: { limit?: number; buildingName?: string }): Promise<RecentDetectionsResult> {
    const limit = args?.limit ?? 20;
    const qb = this.fireDetectionLogRepository
      .createQueryBuilder('detection')
      .leftJoin('detection.camera', 'camera')
      .orderBy('detection.detection_timestamp', 'DESC')
      .take(limit);

    if (args?.buildingName) {
      const resolved = await this.resolveBuilding(args.buildingName);
      if (resolved)
        qb.andWhere('camera.building_id = :buildingId', { buildingId: resolved.id });
    }

    const rows = await qb
      .select(['detection.id AS id', 'detection.camera_code AS cameraCode', 'detection.confidence AS confidence', 'detection.hazard_id AS hazardId', 'detection.detection_timestamp AS detectedAt'])
      .getRawMany<{ id: number; cameraCode: string; confidence: number; hazardId?: number; detectedAt: Date }>();

    return {
      detections: rows.map((r) => ({ id: r.id, cameraCode: r.cameraCode, confidence: Number(r.confidence), detectedAt: new Date(r.detectedAt).toISOString(), hazardId: r.hazardId ?? undefined })),
      count: rows.length,
    };
  }

  // ── New tool implementations ─────────────────────────────────────────────

  async getBuildingInfo(buildingName: string): Promise<BuildingInfoResult> {
    const b = await this.resolveBuilding(buildingName);
    if (!b) return { found: false, message: `No building found matching "${buildingName}".` };
    return { found: true, id: b.id, name: b.name, address: b.address, type: b.type, totalFloors: b.totalFloors, hasFloorPlan: b.hasFloorPlan, societyId: b.society_id ?? undefined };
  }

  async getSensorsForBuilding(buildingName: string, sensorType?: string): Promise<SensorsForBuildingResult> {
    const b = await this.resolveBuilding(buildingName);
    if (!b) return { found: false, sensors: [], summary: { total: 0, alert: 0, active: 0, inactive: 0 }, message: `No building found matching "${buildingName}".` };

    const where: Record<string, unknown> = { buildingId: b.id };
    if (sensorType) where['type'] = sensorType;
    const sensors = await this.sensorRepository.find({ where, order: { createdAt: 'DESC' } });

    const summary = { total: sensors.length, alert: 0, active: 0, inactive: 0 };
    sensors.forEach((s) => {
      if (s.status === 'alert') summary.alert++;
      else if (s.status === 'active') summary.active++;
      else summary.inactive++;
    });

    return {
      found: true, buildingName: b.name, summary,
      sensors: sensors.map((s) => ({ id: s.id, name: s.name, type: s.type, status: s.status, value: s.value ?? undefined, unit: s.unit ?? undefined, lastReading: s.lastReading ? new Date(s.lastReading).toISOString() : undefined })),
    };
  }

  async getCamerasForBuilding(buildingName: string): Promise<CamerasForBuildingResult> {
    const b = await this.resolveBuilding(buildingName);
    if (!b) return { found: false, cameras: [], summary: { total: 0, active: 0, fireDetectionEnabled: 0 }, message: `No building found matching "${buildingName}".` };

    const cameras = await this.cameraRepository.find({ where: { building_id: b.id }, order: { created_at: 'DESC' } });
    const summary = { total: cameras.length, active: cameras.filter((c) => c.status === 'active').length, fireDetectionEnabled: cameras.filter((c) => c.is_fire_detection_enabled).length };

    return {
      found: true, buildingName: b.name, summary,
      cameras: cameras.map((c) => ({ id: c.id, name: c.name, cameraCode: c.camera_id, status: c.status, isFireDetectionEnabled: c.is_fire_detection_enabled, floorId: c.floor_id ?? undefined })),
    };
  }

  async getApartmentInfo(buildingName: string, unitNumber: string): Promise<ApartmentInfoResult> {
    const b = await this.resolveBuilding(buildingName);
    if (!b) return { found: false, message: `No building found matching "${buildingName}".` };

    const floorIds = await this.floorRepository.find({ where: { building_id: b.id }, select: ['id', 'level'] });
    if (!floorIds.length) return { found: false, message: 'No floors found for this building.' };

    const apt = await this.apartmentRepository
      .createQueryBuilder('apt')
      .where('apt.floor_id IN (:...floorIds)', { floorIds: floorIds.map((f) => f.id) })
      .andWhere('LOWER(apt.unit_number) = :unit', { unit: unitNumber.trim().toLowerCase() })
      .getOne();

    if (!apt) return { found: false, message: `Apartment unit "${unitNumber}" not found in ${b.name}.` };

    const floorLevel = floorIds.find((f) => f.id === apt.floor_id)?.level;
    let ownerName: string | undefined;
    let ownerEmail: string | undefined;
    let ownerPhone: string | undefined;

    if (apt.ownerId) {
      const owner = await this.userRepository.findOne({ where: { id: apt.ownerId }, select: ['name', 'email', 'phone'] });
      ownerName = owner?.name;
      ownerEmail = owner?.email;
      ownerPhone = owner?.phone ?? undefined;
    }

    return { found: true, unitNumber: apt.unit_number, floorLevel, occupied: apt.occupied, buildingName: b.name, ownerName, ownerEmail, ownerPhone };
  }

  async getActiveAlerts(buildingName?: string): Promise<ActiveAlertsResult> {
    try {
      const qb = this.alertRepository
        .createQueryBuilder('alert')
        .where('alert.status = :status', { status: 'active' })
        .orderBy('alert.createdAt', 'DESC')
        .take(20);

      if (buildingName) {
        const b = await this.resolveBuilding(buildingName);
        if (b) qb.andWhere('alert.buildingId = :buildingId', { buildingId: b.id });
      }

      const rows = await qb.getMany();
      return {
        alerts: rows.map((a) => ({
          id: a.id,
          title: a.title,
          description: a.description,
          severity: a.severity,
          status: a.status,
          buildingId: a.buildingId,
          createdAt: a.createdAt.toISOString(),
        })),
        count: rows.length,
      };
    } catch (error) {
      // Handle missing table or transient errors gracefully to avoid breaking the AI flow
      return {
        alerts: [],
        count: 0,
      };
    }
  }

  async getSocietyOverview(societyName: string): Promise<SocietyOverviewResult> {
    const s = await this.resolveSociety(societyName);
    if (!s) return { found: false, message: `No society found matching "${societyName}".` };

    const buildings = await this.buildingRepository.find({ where: { society_id: s.id }, take: 10, select: ['id', 'name'] });

    const buildingDetails = await Promise.all(
      buildings.map(async (b) => {
        const [activeHazards, alertSensors] = await Promise.all([
          this.hazardRepository.createQueryBuilder('h').leftJoin('h.floor', 'f').where('f.building_id = :id', { id: b.id }).andWhere('h.status IN (:...s)', { s: ['active', 'pending', 'responding'] }).getCount(),
          this.sensorRepository.count({ where: { buildingId: b.id, status: 'alert' } }),
        ]);
        return { id: b.id, name: b.name, activeHazards, alertSensors };
      }),
    );

    return { found: true, societyName: s.name, buildingCount: buildings.length, buildings: buildingDetails };
  }

  async getBuildingSensorStats(buildingName: string): Promise<SensorStatsResult> {
    const b = await this.resolveBuilding(buildingName);
    if (!b) return { found: false, message: `No building found matching "${buildingName}".` };

    const [total, active, alert, inactive] = await Promise.all([
      this.sensorRepository.count({ where: { buildingId: b.id } }),
      this.sensorRepository.count({ where: { buildingId: b.id, status: 'active' } }),
      this.sensorRepository.count({ where: { buildingId: b.id, status: 'alert' } }),
      this.sensorRepository.count({ where: { buildingId: b.id, status: 'inactive' } }),
    ]);

    return { found: true, buildingName: b.name, total, active, alert, inactive };
  }

  private async findActiveHazard(buildingId: number, hazardType?: string, floorNumber?: number): Promise<hazards | null> {
    const qb = this.hazardRepository
      .createQueryBuilder('h')
      .leftJoin('h.floor', 'f')
      .where('f.building_id = :buildingId', { buildingId })
      .andWhere('h.status IN (:...statuses)', { statuses: ['active', 'pending', 'responding'] })
      .orderBy('h.created_at', 'DESC')
      .take(1);

    if (hazardType) qb.andWhere('LOWER(h.type) LIKE :type', { type: `%${hazardType.toLowerCase()}%` });
    if (floorNumber != null) {
      const floorId = await this.resolveFloorId(buildingId, floorNumber);
      if (floorId) qb.andWhere('h.floor_id = :floorId', { floorId });
    }

    return qb.getOne();
  }

  async respondToHazard(buildingName: string, hazardType?: string, floorNumber?: number): Promise<HazardActionResult> {
    const b = await this.resolveBuilding(buildingName);
    if (!b) return { found: false, message: `No building found matching "${buildingName}".` };

    const hazard = await this.findActiveHazard(b.id, hazardType, floorNumber);
    if (!hazard) return { found: false, message: 'No active hazard found matching the criteria.' };

    const previousStatus = hazard.status;
    hazard.status = 'responding';
    hazard.responded_at = new Date();
    await this.hazardRepository.save(hazard);

    return { found: true, hazardId: hazard.id, type: hazard.type, severity: hazard.severity, previousStatus, newStatus: 'responding', location: `Building: ${b.name}, FloorId: ${hazard.floorId ?? 'unknown'}` };
  }

  async resolveHazard(buildingName: string, hazardType?: string, floorNumber?: number): Promise<HazardActionResult> {
    const b = await this.resolveBuilding(buildingName);
    if (!b) return { found: false, message: `No building found matching "${buildingName}".` };

    const hazard = await this.findActiveHazard(b.id, hazardType, floorNumber);
    if (!hazard) return { found: false, message: 'No active hazard found matching the criteria.' };

    const previousStatus = hazard.status;
    hazard.status = 'resolved';
    hazard.resolved_at = new Date();
    await this.hazardRepository.save(hazard);

    return { found: true, hazardId: hazard.id, type: hazard.type, severity: hazard.severity, previousStatus, newStatus: 'resolved', location: `Building: ${b.name}, FloorId: ${hazard.floorId ?? 'unknown'}` };
  }
}

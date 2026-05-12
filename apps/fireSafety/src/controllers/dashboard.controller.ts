import { Controller, Get, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Sensor, User, hazards, EvacuationRoute, building, camera } from '@app/entities';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { Public } from '../decorators/public.decorator';

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(
    @InjectRepository(Sensor) private sensorRepo: Repository<Sensor>,
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(hazards) private hazardsRepo: Repository<hazards>,
    @InjectRepository(EvacuationRoute) private routeRepo: Repository<EvacuationRoute>,
    @InjectRepository(building) private buildingRepo: Repository<building>,
    @InjectRepository(camera) private cameraRepo: Repository<camera>,
    private dataSource: DataSource,
  ) {}

  @Get('stats')
  @Public()
  async getStats() {
    const [
      totalSensors, activeSensors, alertSensors,
      totalUsers, activeUsers,
      activeHazards, pendingHazards,
      totalRoutes,
      totalBuildings, buildingsWithFloorPlan,
      totalCameras, activeCameras,
    ] = await Promise.all([
      this.sensorRepo.count(),
      this.sensorRepo.count({ where: { status: 'active' } }),
      this.sensorRepo.createQueryBuilder('s')
        .where('s.alert_threshold IS NOT NULL AND s.value IS NOT NULL AND s.value >= s.alert_threshold')
        .getCount(),
      this.userRepo.count(),
      this.userRepo.count({ where: { isActive: true } }),
      this.hazardsRepo.count({ where: { status: 'active' } }),
      this.hazardsRepo.count({ where: { status: 'pending' } }),
      this.routeRepo.count(),
      this.buildingRepo.count(),
      this.buildingRepo.count({ where: { hasFloorPlan: true } }),
      this.cameraRepo.count(),
      this.cameraRepo.count({ where: { status: 'active' } }),
    ]);

    return {
      sensors: {
        total: totalSensors,
        active: activeSensors,
        alert: alertSensors,
        inactive: totalSensors - activeSensors,
      },
      users: { total: totalUsers, active: activeUsers },
      hazards: {
        active: activeHazards,
        pending: pendingHazards,
        total: activeHazards + pendingHazards,
      },
      buildings: { total: totalBuildings, with_floor_plan: buildingsWithFloorPlan },
      cameras: { total: totalCameras, active: activeCameras },
      routes: { total: totalRoutes },
    };
  }

  @Get('recent-alerts')
  @Public()
  async getRecentAlerts() {
    const [rawSensors, activeHazards] = await Promise.all([
      this.dataSource.query<any[]>(`
        SELECT
          s.id, s.name, s.type, s.status, s.value, s.unit,
          s.alert_threshold  AS "alertThreshold",
          s.warning_threshold AS "warningThreshold",
          s.last_reading     AS "lastReading",
          r.id   AS "roomId",   r.name AS "roomName",
          b.id   AS "buildingId", b.name AS "buildingName"
        FROM sensors s
        LEFT JOIN room r     ON r.id = s.room_id
        LEFT JOIN building b ON b.id = s.building_id
        WHERE (s.alert_threshold  IS NOT NULL AND s.value IS NOT NULL AND s.value >= s.alert_threshold)
           OR (s.warning_threshold IS NOT NULL AND s.value IS NOT NULL AND s.value >= s.warning_threshold)
        ORDER BY s.last_reading DESC NULLS LAST
        LIMIT 10
      `),
      this.hazardsRepo.find({
        where: [{ status: 'active' }, { status: 'pending' }, { status: 'responded' }],
        relations: ['room', 'floor', 'floor.building'],
        order: { created_at: 'DESC' },
        take: 15,
      }),
    ]);

    // Strip large / binary fields so the response stays small
    const sanitizeBuilding = (b: any) => {
      if (!b) return null;
      return {
        id: b.id,
        name: b.name,
        address: b.address,
        type: b.type,
        has_floor_plan: b.hasFloorPlan || false,
        has_building_image: !!b.buildingImage,
      };
    };

    const sanitizedHazards = activeHazards.map(h => ({
      id: h.id,
      type: h.type,
      severity: h.severity,
      status: h.status,
      description: h.description || null,
      created_at: h.created_at,
      updated_at: h.updated_at,
      responded_at: h.responded_at || null,
      room: h.room ? { id: h.room.id, name: h.room.name, type: h.room.type } : null,
      floor: h.floor
        ? {
            id: h.floor.id,
            level: h.floor.level,
            name: h.floor.name,
            building: sanitizeBuilding((h.floor as any).building),
          }
        : null,
    }));

    const sanitizedSensors = rawSensors.map(s => {
      const val = s.value != null ? parseFloat(s.value) : null;
      const alertT = s.alertThreshold != null ? parseFloat(s.alertThreshold) : null;
      const warnT = s.warningThreshold != null ? parseFloat(s.warningThreshold) : null;
      const status = (alertT != null && val != null && val >= alertT)
        ? 'alert'
        : (warnT != null && val != null && val >= warnT)
          ? 'warning'
          : s.status;
      return {
        id: s.id,
        name: s.name,
        type: s.type,
        status,
        value: val,
        unit: s.unit,
        alertThreshold: alertT,
        warningThreshold: warnT,
        lastReading: s.lastReading,
        room: s.roomId ? { id: s.roomId, name: s.roomName } : null,
        building: s.buildingId ? { id: s.buildingId, name: s.buildingName } : null,
      };
    });

    return { sensors: sanitizedSensors, hazards: sanitizedHazards };
  }
}

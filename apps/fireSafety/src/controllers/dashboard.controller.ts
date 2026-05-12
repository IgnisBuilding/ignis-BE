import { Controller, Get, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
      this.sensorRepo.count({ where: { status: 'alert' } }),
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
    const [alertSensors, activeHazards] = await Promise.all([
      this.sensorRepo.find({
        where: [{ status: 'alert' }, { status: 'warning' }],
        relations: ['room', 'building'],
        order: { lastReading: 'DESC' },
        take: 10,
      }),
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

    const sanitizedSensors = alertSensors.map(s => ({
      id: s.id,
      name: s.name,
      type: s.type,
      status: s.status,
      value: s.value,
      unit: s.unit,
      alertThreshold: s.alertThreshold,
      warningThreshold: s.warningThreshold,
      lastReading: s.lastReading,
      room: s.room ? { id: s.room.id, name: s.room.name } : null,
      building: sanitizeBuilding(s.building),
    }));

    return { sensors: sanitizedSensors, hazards: sanitizedHazards };
  }
}

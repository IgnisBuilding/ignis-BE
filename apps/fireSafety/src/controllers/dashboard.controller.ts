import { Controller, Get, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Sensor, User, hazards, EvacuationRoute } from '@app/entities';
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
  ) {}

  @Get('stats')
  @Public()
  async getStats() {
    const [totalSensors, activeSensors, alertSensors, totalUsers, activeUsers, activeHazards, totalRoutes] = await Promise.all([
      this.sensorRepo.count(),
      this.sensorRepo.count({ where: { status: 'active' } }),
      this.sensorRepo.count({ where: { status: 'alert' } }),
      this.userRepo.count(),
      this.userRepo.count({ where: { isActive: true } }),
      this.hazardsRepo.count({ where: { status: 'ACTIVE' } }),
      this.routeRepo.count(),
    ]);
    return {
      sensors: { total: totalSensors, active: activeSensors, alert: alertSensors, inactive: totalSensors - activeSensors },
      users: { total: totalUsers, active: activeUsers },
      hazards: { active: activeHazards },
      routes: { total: totalRoutes },
    };
  }

  @Get('recent-alerts')
  @Public()
  async getRecentAlerts() {
    const [alertSensors, activeHazards] = await Promise.all([
      this.sensorRepo.find({ where: { status: 'alert' }, relations: ['room'], order: { lastReading: 'DESC' }, take: 10 }),
      this.hazardsRepo.find({ where: { status: 'ACTIVE' }, order: { created_at: 'DESC' }, take: 10 }),
    ]);
    return { sensors: alertSensors, hazards: activeHazards };
  }
}

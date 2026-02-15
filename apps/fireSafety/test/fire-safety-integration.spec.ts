import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { AlertService } from '../src/services/alert.service';
import { SensorService } from '../src/services/sensor.service';
import { HazardService } from '../src/services/hazard.service';
import { Alert, Sensor, hazards } from '@app/entities';

describe('FireSafety Integration Tests', () => {
  let app: INestApplication;
  let alertService: AlertService;
  let sensorService: SensorService;
  let hazardService: HazardService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env.test',
        }),
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: process.env.DB_HOST || 'localhost',
          port: parseInt(process.env.DB_PORT || '5432'),
          username: process.env.DB_USER || 'postgres',
          password: process.env.DB_PASS || 'postgres',
          database: process.env.DB_NAME || 'ignis_test',
          entities: [Alert, Sensor, hazards],
          synchronize: true,
          dropSchema: true,
        }),
        TypeOrmModule.forFeature([Alert, Sensor, hazards]),
      ],
      providers: [AlertService, SensorService, HazardService],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    alertService = moduleFixture.get<AlertService>(AlertService);
    sensorService = moduleFixture.get<SensorService>(SensorService);
    hazardService = moduleFixture.get<HazardService>(HazardService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Alert and Hazard Integration', () => {
    it('should create hazard and corresponding alert', async () => {
      const hazard = await hazardService.create({
        type: 'fire',
        severity: 'high',
        status: 'active',
        floorId: 1,
      });

      const alert = await alertService.create({
        title: 'Fire Alert',
        description: 'Fire detected',
        severity: 'high' as any,
        buildingId: 1,
      });

      expect(hazard).toBeDefined();
      expect(alert).toBeDefined();
    });

    it('should resolve hazard and alert together', async () => {
      const hazard = await hazardService.create({
        type: 'smoke',
        severity: 'medium',
        status: 'active',
        floorId: 2,
      });

      const alert = await alertService.create({
        title: 'Smoke Alert',
        description: 'Smoke detected',
        severity: 'medium' as any,
        buildingId: 1,
      });

      await hazardService.updateStatus(hazard.hazard_id, { status: 'resolved' });
      await alertService.markAsResolved(alert.alert_id);

      const resolvedHazard = await hazardService.findOne(hazard.hazard_id);
      const resolvedAlert = await alertService.findOne(alert.alert_id);

      expect(resolvedHazard.status).toBe('resolved');
      expect(resolvedAlert.status).toBe('resolved');
    });
  });

  describe('Sensor and Alert Integration', () => {
    it('should create sensor and trigger alert', async () => {
      const sensor = await sensorService.create({
        type: 'smoke',
        location: 'Room 101',
        building_id: 1,
        floor_id: 1,
        status: 'active',
      });

      const alert = await alertService.create({
        type: 'smoke',
        severity: 'medium',
        location: sensor.location,
        message: `Smoke detected by sensor ${sensor.sensor_id}`,
        sensor_id: sensor.sensor_id,
      });

      expect(sensor).toBeDefined();
      expect(alert).toBeDefined();
      expect(alert.sensor_id).toBe(sensor.sensor_id);
    });

    it('should deactivate faulty sensor and clear related alerts', async () => {
      const sensor = await sensorService.create({
        type: 'heat',
        location: 'Room 202',
        building_id: 1,
        floor_id: 2,
        status: 'active',
      });

      await sensorService.update(sensor.sensor_id, { status: 'faulty' });

      const alerts = await alertService.findBySensor(sensor.sensor_id);
      for (const alert of alerts) {
        await alertService.markAsResolved(alert.alert_id);
      }

      const updatedSensor = await sensorService.findOne(sensor.sensor_id);
      expect(updatedSensor.status).toBe('faulty');
    });
  });

  describe('Building-wide Operations', () => {
    it('should get all hazards and alerts for a building', async () => {
      const buildingId = 1;

      await hazardService.create({
        type: 'fire',
        severity: 'critical',
        location: `Building ${buildingId} - Floor 1`,
        description: 'Fire in building',
      });

      await alertService.create({
        type: 'fire',
        severity: 'critical',
        location: `Building ${buildingId}`,
        message: 'Evacuate immediately',
        building_id: buildingId,
      });

      const buildingSensors = await sensorService.findByBuilding(buildingId);
      const buildingAlerts = await alertService.findByBuilding(buildingId);

      expect(buildingSensors).toBeDefined();
      expect(buildingAlerts).toBeDefined();
      expect(Array.isArray(buildingSensors)).toBe(true);
      expect(Array.isArray(buildingAlerts)).toBe(true);
    });
  });

  describe('Cascade Operations', () => {
    it('should handle multiple sensors triggering single hazard', async () => {
      const sensors = await Promise.all([
        sensorService.create({
          type: 'smoke',
          location: 'Room 301',
          building_id: 1,
          floor_id: 3,
          status: 'active',
        }),
        sensorService.create({
          type: 'heat',
          location: 'Room 302',
          building_id: 1,
          floor_id: 3,
          status: 'active',
        }),
      ]);

      const hazard = await hazardService.create({
        type: 'fire',
        severity: 'high',
        location: 'Floor 3',
        description: 'Multiple sensors triggered',
      });

      for (const sensor of sensors) {
        await alertService.create({
          type: 'fire',
          severity: 'high',
          location: sensor.location,
          message: 'Fire detected',
          sensor_id: sensor.sensor_id,
          hazard_id: hazard.hazard_id,
        });
      }

      const hazardAlerts = await alertService.findByHazard(hazard.hazard_id);
      expect(hazardAlerts.length).toBeGreaterThanOrEqual(2);
    });
  });
});

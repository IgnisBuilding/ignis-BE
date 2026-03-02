import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';

describe('FireSafety E2E Tests', () => {
  let app: INestApplication;
  let authToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  }, 30000); // Increase timeout to 30 seconds

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('Authentication', () => {
    it('/auth/login (POST) - should authenticate user', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          username: 'testuser',
          password: 'testpass',
        })
        .expect(201);

      expect(response.body).toHaveProperty('access_token');
      authToken = response.body.access_token;
    });

    it('/auth/login (POST) - should reject invalid credentials', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          username: 'invalid',
          password: 'invalid',
        })
        .expect(401);
    });
  });

  describe('Alerts', () => {
    it('/alerts (GET) - should return all alerts', async () => {
      const response = await request(app.getHttpServer())
        .get('/alerts')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('/alerts/:id (GET) - should return single alert', async () => {
      const response = await request(app.getHttpServer())
        .get('/alerts/1')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('alert_id');
    });

    it('/alerts (POST) - should create new alert', async () => {
      const newAlert = {
        type: 'fire',
        severity: 'high',
        location: 'Test Location',
        message: 'Test alert',
      };

      const response = await request(app.getHttpServer())
        .post('/alerts')
        .set('Authorization', `Bearer ${authToken}`)
        .send(newAlert)
        .expect(201);

      expect(response.body).toHaveProperty('alert_id');
      expect(response.body.type).toBe(newAlert.type);
    });

    it('/alerts/:id/resolve (PATCH) - should resolve alert', async () => {
      const response = await request(app.getHttpServer())
        .patch('/alerts/1/resolve')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.status).toBe('resolved');
    });
  });

  describe('Sensors', () => {
    it('/sensors (GET) - should return all sensors', async () => {
      const response = await request(app.getHttpServer())
        .get('/sensors')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('/sensors/:id (GET) - should return single sensor', async () => {
      const response = await request(app.getHttpServer())
        .get('/sensors/1')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('sensor_id');
    });

    it('/sensors (POST) - should create new sensor', async () => {
      const newSensor = {
        type: 'smoke',
        location: 'Room 101',
        building_id: 1,
        floor_id: 1,
      };

      const response = await request(app.getHttpServer())
        .post('/sensors')
        .set('Authorization', `Bearer ${authToken}`)
        .send(newSensor)
        .expect(201);

      expect(response.body).toHaveProperty('sensor_id');
      expect(response.body.type).toBe(newSensor.type);
    });
  });

  describe('Hazards', () => {
    it('/hazards (GET) - should return all hazards', async () => {
      const response = await request(app.getHttpServer())
        .get('/hazards')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('/hazards/active (GET) - should return only active hazards', async () => {
      const response = await request(app.getHttpServer())
        .get('/hazards/active')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      response.body.forEach((hazard) => {
        expect(hazard.status).toBe('active');
      });
    });

    it('/hazards (POST) - should create new hazard', async () => {
      const newHazard = {
        type: 'fire',
        severity: 'high',
        location: 'Building A - Floor 2',
        description: 'Test hazard',
      };

      const response = await request(app.getHttpServer())
        .post('/hazards')
        .set('Authorization', `Bearer ${authToken}`)
        .send(newHazard)
        .expect(201);

      expect(response.body).toHaveProperty('hazard_id');
    });

    it('/hazards/:id/respond (PATCH) - should mark hazard as responding', async () => {
      const response = await request(app.getHttpServer())
        .patch('/hazards/1/respond')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.status).toBe('responding');
    });
  });

  describe('Dashboard', () => {
    it('/dashboard (GET) - should return dashboard stats', async () => {
      const response = await request(app.getHttpServer())
        .get('/dashboard')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('totalSensors');
      expect(response.body).toHaveProperty('activeSensors');
      expect(response.body).toHaveProperty('activeHazards');
      expect(response.body).toHaveProperty('totalResidents');
    });
  });

  describe('Authorization', () => {
    it('should reject requests without token', async () => {
      await request(app.getHttpServer()).get('/alerts').expect(401);
    });

    it('should reject requests with invalid token', async () => {
      await request(app.getHttpServer())
        .get('/alerts')
        .set('Authorization', 'Bearer invalid_token')
        .expect(401);
    });
  });
});

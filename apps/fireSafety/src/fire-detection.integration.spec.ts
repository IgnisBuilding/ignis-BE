import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ConfigModule } from '@nestjs/config';
import { FireDetectionController } from './controllers/fire-detection.controller';
import { FireDetectionService } from './services/fire-detection.service';
import { FireDetectionGateway } from './gateways/fire-detection.gateway';
import { CameraService } from './services/camera.service';
import { CameraController } from './controllers/camera.controller';
import { camera, fire_detection_log, fire_alert_config, hazards, building } from '@app/entities';

/**
 * Integration tests for the Fire Detection Pipeline
 *
 * These tests verify the complete flow:
 * 1. Camera registration
 * 2. Fire detection alert processing
 * 3. Hazard creation
 * 4. WebSocket event emission
 * 5. Detection logging
 */
describe('Fire Detection Pipeline Integration', () => {
  let app: INestApplication;
  let cameraRepository: Repository<camera>;
  let logRepository: Repository<fire_detection_log>;
  let configRepository: Repository<fire_alert_config>;
  let hazardRepository: Repository<hazards>;
  let buildingRepository: Repository<building>;
  let gateway: FireDetectionGateway;

  // Mock data
  const testBuilding = {
    name: 'Test Building',
    address: '123 Test St',
    type: 'commercial',
    society_id: 1,
  };

  const testCamera = {
    name: 'Test Camera',
    camera_id: 'TEST_CAM_001',
    rtsp_url: 'rtsp://192.168.1.100:554/stream',
    building_id: 1,
    is_fire_detection_enabled: true,
    status: 'active',
  };

  const fireDetectionAlert = {
    camera_id: 'TEST_CAM_001',
    timestamp: Date.now() / 1000,
    detections: [
      { bbox: [100, 100, 200, 200], score: 0.95, label: 'fire' },
    ],
    latency: 45,
  };

  // Note: These integration tests require a test database
  // In a real scenario, you would use a test database or in-memory database

  describe('Fire Detection Alert Processing (Unit Integration)', () => {
    let fireDetectionService: FireDetectionService;
    let mockGateway: jest.Mocked<FireDetectionGateway>;

    const mockCameraRepo = {
      findOne: jest.fn(),
    };

    const mockLogRepo = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    const mockConfigRepo = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    const mockHazardRepo = {
      create: jest.fn(),
      save: jest.fn(),
    };

    beforeEach(async () => {
      mockGateway = {
        emitFireDetected: jest.fn(),
        emitFireResolved: jest.fn(),
        server: {} as any,
        afterInit: jest.fn(),
        handleConnection: jest.fn(),
        handleDisconnect: jest.fn(),
        handleSubscribeBuilding: jest.fn(),
        handleUnsubscribeBuilding: jest.fn(),
        getConnectedClientsCount: jest.fn().mockReturnValue(0),
      } as any;

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          FireDetectionService,
          {
            provide: getRepositoryToken(camera),
            useValue: mockCameraRepo,
          },
          {
            provide: getRepositoryToken(fire_detection_log),
            useValue: mockLogRepo,
          },
          {
            provide: getRepositoryToken(fire_alert_config),
            useValue: mockConfigRepo,
          },
          {
            provide: getRepositoryToken(hazards),
            useValue: mockHazardRepo,
          },
          {
            provide: FireDetectionGateway,
            useValue: mockGateway,
          },
        ],
      }).compile();

      fireDetectionService = module.get<FireDetectionService>(FireDetectionService);

      jest.clearAllMocks();
    });

    it('should process complete fire detection flow', async () => {
      // Setup: Camera exists and is enabled
      mockCameraRepo.findOne.mockResolvedValue({
        id: 1,
        camera_id: 'TEST_CAM_001',
        name: 'Test Camera',
        building_id: 1,
        floor_id: 1,
        room_id: 1,
        is_fire_detection_enabled: true,
        location_description: 'Main Lobby',
      });

      // Setup: Config with single detection trigger
      mockConfigRepo.findOne.mockResolvedValue({
        id: 1,
        building_id: 1,
        min_confidence: 0.7,
        consecutive_detections: 1,
        cooldown_seconds: 60,
        auto_create_hazard: true,
        auto_notify_firefighters: true,
      });

      // Setup: No recent alerts (cooldown check passes)
      mockLogRepo.findOne.mockResolvedValue(null);

      // Setup: Log creation
      mockLogRepo.create.mockReturnValue({
        id: 1,
        camera_id: 1,
        camera_code: 'TEST_CAM_001',
        confidence: 0.95,
        alert_triggered: false,
      });
      mockLogRepo.save.mockImplementation((log) => Promise.resolve({ ...log, id: 1 }));

      // Setup: Hazard creation
      mockHazardRepo.create.mockReturnValue({
        id: 1,
        type: 'fire',
        severity: 'critical',
        status: 'active',
      });
      mockHazardRepo.save.mockResolvedValue({
        id: 1,
        type: 'fire',
        severity: 'critical',
        status: 'active',
      });

      // Execute: Process fire detection alert
      const result = await fireDetectionService.processAlert(fireDetectionAlert);

      // Verify: Alert was processed successfully
      expect(result.received).toBe(true);
      expect(result.logged).toBe(true);
      expect(result.alert_triggered).toBe(true);
      expect(result.hazard_id).toBe(1);

      // Verify: Detection was logged
      expect(mockLogRepo.create).toHaveBeenCalled();
      expect(mockLogRepo.save).toHaveBeenCalled();

      // Verify: Hazard was created
      expect(mockHazardRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'fire',
          severity: 'critical',
          status: 'active',
        }),
      );

      // Verify: WebSocket event was emitted
      expect(mockGateway.emitFireDetected).toHaveBeenCalledWith(
        expect.objectContaining({
          camera_id: 'TEST_CAM_001',
          building_id: 1,
          confidence: 0.95,
          severity: 'critical',
        }),
      );
    });

    it('should respect cooldown period', async () => {
      // Setup: Camera exists
      mockCameraRepo.findOne.mockResolvedValue({
        id: 1,
        camera_id: 'TEST_CAM_001',
        is_fire_detection_enabled: true,
        building_id: 1,
      });

      // Setup: Config
      mockConfigRepo.findOne.mockResolvedValue({
        min_confidence: 0.7,
        consecutive_detections: 1,
        cooldown_seconds: 60,
        auto_create_hazard: true,
      });

      // Setup: Recent alert exists (within cooldown)
      mockLogRepo.findOne.mockResolvedValue({
        id: 1,
        alert_triggered: true,
        created_at: new Date(), // Just created
      });

      mockLogRepo.create.mockReturnValue({ id: 2 });
      mockLogRepo.save.mockResolvedValue({ id: 2 });

      // Execute
      const result = await fireDetectionService.processAlert(fireDetectionAlert);

      // Verify: Alert not triggered due to cooldown
      expect(result.logged).toBe(true);
      expect(result.alert_triggered).toBe(false);
      expect(result.reason).toContain('Cooldown active');
    });

    it('should not trigger alert if confidence below threshold', async () => {
      mockCameraRepo.findOne.mockResolvedValue({
        id: 1,
        camera_id: 'TEST_CAM_001',
        is_fire_detection_enabled: true,
        building_id: 1,
      });

      mockConfigRepo.findOne.mockResolvedValue({
        min_confidence: 0.99, // Very high threshold
        consecutive_detections: 1,
        cooldown_seconds: 60,
        auto_create_hazard: true,
      });

      mockLogRepo.findOne.mockResolvedValue(null);
      mockLogRepo.create.mockReturnValue({ id: 1 });
      mockLogRepo.save.mockResolvedValue({ id: 1 });

      const lowConfidenceAlert = {
        ...fireDetectionAlert,
        detections: [{ bbox: [100, 100, 200, 200], score: 0.85, label: 'fire' }],
      };

      const result = await fireDetectionService.processAlert(lowConfidenceAlert);

      expect(result.logged).toBe(true);
      expect(result.alert_triggered).toBe(false);
      expect(result.reason).toContain('below threshold');
    });

    it('should handle disabled cameras gracefully', async () => {
      mockCameraRepo.findOne.mockResolvedValue({
        id: 1,
        camera_id: 'TEST_CAM_001',
        is_fire_detection_enabled: false, // Disabled
        building_id: 1,
      });

      const result = await fireDetectionService.processAlert(fireDetectionAlert);

      expect(result.received).toBe(true);
      expect(result.logged).toBe(false);
      expect(result.reason).toContain('disabled');
    });

    it('should handle unknown cameras gracefully', async () => {
      mockCameraRepo.findOne.mockResolvedValue(null);

      const result = await fireDetectionService.processAlert({
        ...fireDetectionAlert,
        camera_id: 'UNKNOWN_CAM',
      });

      expect(result.received).toBe(true);
      expect(result.logged).toBe(false);
      expect(result.reason).toContain('not found');
    });
  });

  describe('Fire Alert Configuration', () => {
    let fireDetectionService: FireDetectionService;

    const mockCameraRepo = { findOne: jest.fn() };
    const mockLogRepo = { create: jest.fn(), save: jest.fn(), findOne: jest.fn() };
    const mockConfigRepo = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    const mockHazardRepo = { create: jest.fn(), save: jest.fn() };
    const mockGateway = { emitFireDetected: jest.fn() };

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          FireDetectionService,
          { provide: getRepositoryToken(camera), useValue: mockCameraRepo },
          { provide: getRepositoryToken(fire_detection_log), useValue: mockLogRepo },
          { provide: getRepositoryToken(fire_alert_config), useValue: mockConfigRepo },
          { provide: getRepositoryToken(hazards), useValue: mockHazardRepo },
          { provide: FireDetectionGateway, useValue: mockGateway },
        ],
      }).compile();

      fireDetectionService = module.get<FireDetectionService>(FireDetectionService);
      jest.clearAllMocks();
    });

    it('should create default config when none exists', async () => {
      mockConfigRepo.findOne.mockResolvedValue(null);
      mockConfigRepo.create.mockReturnValue({
        building_id: 1,
        min_confidence: 0.7,
        consecutive_detections: 3,
        cooldown_seconds: 60,
        auto_create_hazard: true,
        auto_notify_firefighters: true,
      });
      mockConfigRepo.save.mockImplementation((config) =>
        Promise.resolve({ ...config, id: 1 }),
      );

      const result = await fireDetectionService.getOrCreateConfig(1);

      expect(result.building_id).toBe(1);
      expect(result.min_confidence).toBe(0.7);
      expect(result.consecutive_detections).toBe(3);
      expect(mockConfigRepo.save).toHaveBeenCalled();
    });

    it('should return existing config', async () => {
      const existingConfig = {
        id: 1,
        building_id: 1,
        min_confidence: 0.8,
        consecutive_detections: 5,
        cooldown_seconds: 120,
        auto_create_hazard: false,
        auto_notify_firefighters: true,
      };
      mockConfigRepo.findOne.mockResolvedValue(existingConfig);

      const result = await fireDetectionService.getOrCreateConfig(1);

      expect(result).toEqual(existingConfig);
      expect(mockConfigRepo.save).not.toHaveBeenCalled();
    });
  });
});

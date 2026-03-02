import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FireDetectionService } from './fire-detection.service';
import { FireDetectionGateway } from '../gateways/fire-detection.gateway';
import { camera, fire_detection_log, fire_alert_config, hazards } from '@app/entities';
import { NotFoundException } from '@nestjs/common';

describe('FireDetectionService', () => {
  let service: FireDetectionService;
  let cameraRepository: jest.Mocked<Repository<camera>>;
  let logRepository: jest.Mocked<Repository<fire_detection_log>>;
  let configRepository: jest.Mocked<Repository<fire_alert_config>>;
  let hazardRepository: jest.Mocked<Repository<hazards>>;
  let gateway: jest.Mocked<FireDetectionGateway>;

  const mockCamera: Partial<camera> = {
    id: 1,
    name: 'Test Camera',
    camera_id: 'CAM001',
    building_id: 1,
    floor_id: 1,
    room_id: 1,
    is_fire_detection_enabled: true,
    location_description: 'Main Lobby',
  };

  const mockConfig: Partial<fire_alert_config> = {
    id: 1,
    building_id: 1,
    min_confidence: 0.7,
    consecutive_detections: 3,
    cooldown_seconds: 60,
    auto_create_hazard: true,
    auto_notify_firefighters: true,
  };

  const mockLog: Partial<fire_detection_log> = {
    id: 1,
    camera_id: 1,
    camera_code: 'CAM001',
    confidence: 0.85,
    alert_triggered: false,
    detection_timestamp: new Date(),
    created_at: new Date(),
  };

  const mockCameraRepository = {
    findOne: jest.fn(),
  };

  const mockLogRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    createQueryBuilder: jest.fn(),
    count: jest.fn(),
  };

  const mockConfigRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockHazardRepository = {
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockGateway = {
    emitFireDetected: jest.fn(),
    emitFireResolved: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FireDetectionService,
        {
          provide: getRepositoryToken(camera),
          useValue: mockCameraRepository,
        },
        {
          provide: getRepositoryToken(fire_detection_log),
          useValue: mockLogRepository,
        },
        {
          provide: getRepositoryToken(fire_alert_config),
          useValue: mockConfigRepository,
        },
        {
          provide: getRepositoryToken(hazards),
          useValue: mockHazardRepository,
        },
        {
          provide: FireDetectionGateway,
          useValue: mockGateway,
        },
      ],
    }).compile();

    service = module.get<FireDetectionService>(FireDetectionService);
    cameraRepository = module.get(getRepositoryToken(camera));
    logRepository = module.get(getRepositoryToken(fire_detection_log));
    configRepository = module.get(getRepositoryToken(fire_alert_config));
    hazardRepository = module.get(getRepositoryToken(hazards));
    gateway = module.get(FireDetectionGateway);

    jest.clearAllMocks();
  });

  describe('processAlert', () => {
    const alertDto = {
      camera_id: 'CAM001',
      timestamp: Date.now() / 1000,
      detections: [
        { bbox: [100, 100, 200, 200], score: 0.85, label: 'fire' },
      ],
      latency: 50,
    };

    it('should return logged=false if camera not found', async () => {
      mockCameraRepository.findOne.mockResolvedValue(null);

      const result = await service.processAlert(alertDto);

      expect(result.received).toBe(true);
      expect(result.logged).toBe(false);
      expect(result.alert_triggered).toBe(false);
      expect(result.reason).toContain('not found');
    });

    it('should return logged=false if fire detection is disabled', async () => {
      mockCameraRepository.findOne.mockResolvedValue({
        ...mockCamera,
        is_fire_detection_enabled: false,
      });

      const result = await service.processAlert(alertDto);

      expect(result.received).toBe(true);
      expect(result.logged).toBe(false);
      expect(result.reason).toContain('disabled');
    });

    it('should log detection and return alert_triggered=false if confidence too low', async () => {
      mockCameraRepository.findOne.mockResolvedValue(mockCamera);
      mockConfigRepository.findOne.mockResolvedValue({
        ...mockConfig,
        min_confidence: 0.9, // Higher than detection score
      });
      mockLogRepository.create.mockReturnValue(mockLog);
      mockLogRepository.save.mockResolvedValue(mockLog);
      mockLogRepository.findOne.mockResolvedValue(null); // No recent alerts

      const result = await service.processAlert({
        ...alertDto,
        detections: [{ bbox: [100, 100, 200, 200], score: 0.85, label: 'fire' }],
      });

      expect(result.logged).toBe(true);
      expect(result.alert_triggered).toBe(false);
      expect(result.reason).toContain('below threshold');
    });

    it('should create hazard and emit event when alert criteria met', async () => {
      mockCameraRepository.findOne.mockResolvedValue(mockCamera);
      mockConfigRepository.findOne.mockResolvedValue({
        ...mockConfig,
        consecutive_detections: 1, // Single detection triggers
      });
      mockLogRepository.create.mockReturnValue(mockLog);
      mockLogRepository.save.mockResolvedValue(mockLog);
      mockLogRepository.findOne.mockResolvedValue(null); // No recent alerts (cooldown check)
      mockHazardRepository.create.mockReturnValue({ id: 1, type: 'fire' });
      mockHazardRepository.save.mockResolvedValue({ id: 1, type: 'fire' });

      const result = await service.processAlert(alertDto);

      expect(result.alert_triggered).toBe(true);
      expect(result.hazard_id).toBe(1);
      expect(mockGateway.emitFireDetected).toHaveBeenCalled();
    });

    it('should return logged=false if no fire detections in payload', async () => {
      mockCameraRepository.findOne.mockResolvedValue(mockCamera);

      const result = await service.processAlert({
        ...alertDto,
        detections: [{ bbox: [100, 100, 200, 200], score: 0.85, label: 'smoke' }],
      });

      expect(result.logged).toBe(false);
      expect(result.reason).toContain('No fire detections');
    });
  });

  describe('getOrCreateConfig', () => {
    it('should return existing config', async () => {
      mockConfigRepository.findOne.mockResolvedValue(mockConfig);

      const result = await service.getOrCreateConfig(1);

      expect(result).toEqual(mockConfig);
    });

    it('should create default config if none exists', async () => {
      mockConfigRepository.findOne.mockResolvedValue(null);
      mockConfigRepository.create.mockReturnValue({
        building_id: 1,
        min_confidence: 0.7,
        consecutive_detections: 3,
        cooldown_seconds: 60,
        auto_create_hazard: true,
        auto_notify_firefighters: true,
      });
      mockConfigRepository.save.mockResolvedValue({
        id: 1,
        building_id: 1,
        min_confidence: 0.7,
        consecutive_detections: 3,
        cooldown_seconds: 60,
        auto_create_hazard: true,
        auto_notify_firefighters: true,
      });

      const result = await service.getOrCreateConfig(1);

      expect(mockConfigRepository.create).toHaveBeenCalled();
      expect(mockConfigRepository.save).toHaveBeenCalled();
      expect(result.building_id).toBe(1);
    });
  });

  describe('getConfig', () => {
    it('should return config for building', async () => {
      mockConfigRepository.findOne.mockResolvedValue(mockConfig);

      const result = await service.getConfig(1);

      expect(result).toEqual(mockConfig);
    });

    it('should throw NotFoundException if config not found', async () => {
      mockConfigRepository.findOne.mockResolvedValue(null);

      await expect(service.getConfig(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateConfig', () => {
    it('should update existing config', async () => {
      mockConfigRepository.findOne.mockResolvedValue(mockConfig);
      mockConfigRepository.save.mockResolvedValue({
        ...mockConfig,
        min_confidence: 0.8,
      });

      const result = await service.updateConfig(1, { min_confidence: 0.8 });

      expect(result.min_confidence).toBe(0.8);
    });
  });

  describe('getDetectionLogs', () => {
    it('should return logs for a camera', async () => {
      const logs = [mockLog];
      mockLogRepository.find.mockResolvedValue(logs);

      const result = await service.getDetectionLogs(1, 100);

      expect(result).toEqual(logs);
      expect(mockLogRepository.find).toHaveBeenCalledWith({
        where: { camera_id: 1 },
        order: { detection_timestamp: 'DESC' },
        take: 100,
      });
    });
  });

  describe('getDetectionStats', () => {
    it('should return detection statistics', async () => {
      const mockQueryBuilder = {
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        clone: jest.fn().mockReturnThis(),
        getCount: jest.fn(),
      };

      mockQueryBuilder.getCount
        .mockResolvedValueOnce(100) // total
        .mockResolvedValueOnce(10) // alertsTriggered
        .mockResolvedValueOnce(5); // detectionsToday

      mockLogRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.getDetectionStats();

      expect(result.total).toBe(100);
      expect(result.alertsTriggered).toBe(10);
      expect(result.detectionsToday).toBe(5);
      expect(result.alertRate).toBe('10.00%');
    });

    it('should return 0% alert rate when no detections', async () => {
      const mockQueryBuilder = {
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        clone: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(0),
      };

      mockLogRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.getDetectionStats();

      expect(result.alertRate).toBe('0%');
    });
  });
});

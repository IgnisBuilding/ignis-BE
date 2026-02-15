import { Test, TestingModule } from '@nestjs/testing';
import { AlertService } from './alert.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Alert, AlertStatus } from '@app/entities';
import { Repository } from 'typeorm';
import { NotFoundException } from '@nestjs/common';

describe('AlertService', () => {
  let service: AlertService;
  let repository: Repository<Alert>;

  const mockAlertRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  const mockAlert = {
    alert_id: 1,
    type: 'fire',
    severity: 'high',
    location: 'Building A',
    status: AlertStatus.ACTIVE,
    message: 'Fire detected',
    created_at: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlertService,
        {
          provide: getRepositoryToken(Alert),
          useValue: mockAlertRepository,
        },
      ],
    }).compile();

    service = module.get<AlertService>(AlertService);
    repository = module.get<Repository<Alert>>(getRepositoryToken(Alert));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return an array of alerts', async () => {
      const alerts = [mockAlert];
      mockAlertRepository.find.mockResolvedValue(alerts);

      const result = await service.findAll();

      expect(result).toEqual(alerts);
      expect(mockAlertRepository.find).toHaveBeenCalled();
    });

    it('should handle empty alerts', async () => {
      mockAlertRepository.find.mockResolvedValue([]);

      const result = await service.findAll();

      expect(result).toEqual([]);
    });
  });

  describe('findOne', () => {
    it('should return a single alert', async () => {
      mockAlertRepository.findOne.mockResolvedValue(mockAlert);

      const result = await service.findOne(1);

      expect(result).toEqual(mockAlert);
      expect(mockAlertRepository.findOne).toHaveBeenCalledWith({
        where: { alert_id: 1 },
      });
    });

    it('should throw NotFoundException when alert not found', async () => {
      mockAlertRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('should create a new alert', async () => {
      const createAlertDto = {
        type: 'fire',
        severity: 'high',
        location: 'Building A',
        message: 'Fire detected',
      };

      mockAlertRepository.create.mockReturnValue(mockAlert);
      mockAlertRepository.save.mockResolvedValue(mockAlert);

      const result = await service.create(createAlertDto);

      expect(result).toEqual(mockAlert);
      expect(mockAlertRepository.create).toHaveBeenCalledWith(createAlertDto);
      expect(mockAlertRepository.save).toHaveBeenCalledWith(mockAlert);
    });
  });

  describe('markAsResolved', () => {
    it('should mark alert as resolved', async () => {
      const resolvedAlert = { ...mockAlert, status: AlertStatus.RESOLVED };
      mockAlertRepository.findOne.mockResolvedValue(mockAlert);
      mockAlertRepository.save.mockResolvedValue(resolvedAlert);

      const result = await service.markAsResolved(1);

      expect(result.status).toBe(AlertStatus.RESOLVED);
      expect(mockAlertRepository.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException when alert not found', async () => {
      mockAlertRepository.findOne.mockResolvedValue(null);

      await expect(service.markAsResolved(999)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('should delete an alert', async () => {
      mockAlertRepository.findOne.mockResolvedValue(mockAlert);
      mockAlertRepository.delete.mockResolvedValue({ affected: 1 });

      await service.remove(1);

      expect(mockAlertRepository.delete).toHaveBeenCalledWith(1);
    });

    it('should throw NotFoundException when alert not found', async () => {
      mockAlertRepository.findOne.mockResolvedValue(null);

      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByStatus', () => {
    it('should return alerts filtered by status', async () => {
      const activeAlerts = [mockAlert];
      mockAlertRepository.find.mockResolvedValue(activeAlerts);

      const result = await service.findByStatus(AlertStatus.ACTIVE);

      expect(result).toEqual(activeAlerts);
      expect(mockAlertRepository.find).toHaveBeenCalledWith({
        where: { status: AlertStatus.ACTIVE },
      });
    });
  });
});

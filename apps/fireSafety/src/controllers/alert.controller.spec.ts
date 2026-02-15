import { Test, TestingModule } from '@nestjs/testing';
import { AlertController } from './alert.controller';
import { AlertService } from '../services/alert.service';
import { AlertStatus } from '@app/entities';
import { NotFoundException } from '@nestjs/common';

describe('AlertController', () => {
  let controller: AlertController;
  let service: AlertService;

  const mockAlertService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    markAsResolved: jest.fn(),
    remove: jest.fn(),
    findByStatus: jest.fn(),
    findByBuilding: jest.fn(),
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
      controllers: [AlertController],
      providers: [
        {
          provide: AlertService,
          useValue: mockAlertService,
        },
      ],
    }).compile();

    controller = module.get<AlertController>(AlertController);
    service = module.get<AlertService>(AlertService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should return an array of alerts', async () => {
      const alerts = [mockAlert];
      mockAlertService.findAll.mockResolvedValue(alerts);

      const result = await controller.findAll();

      expect(result).toEqual(alerts);
      expect(mockAlertService.findAll).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return a single alert', async () => {
      mockAlertService.findOne.mockResolvedValue(mockAlert);

      const result = await controller.findOne(1);

      expect(result).toEqual(mockAlert);
      expect(mockAlertService.findOne).toHaveBeenCalledWith(1);
    });

    it('should throw NotFoundException when alert not found', async () => {
      mockAlertService.findOne.mockRejectedValue(new NotFoundException());

      await expect(controller.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('should create a new alert', async () => {
      const createDto = {
        type: 'fire',
        severity: 'high',
        location: 'Building A',
        message: 'Fire detected',
      };

      mockAlertService.create.mockResolvedValue(mockAlert);

      const result = await controller.create(createDto);

      expect(result).toEqual(mockAlert);
      expect(mockAlertService.create).toHaveBeenCalledWith(createDto);
    });
  });

  describe('update', () => {
    it('should update an alert', async () => {
      const updateDto = { status: AlertStatus.ACKNOWLEDGED };
      const updatedAlert = { ...mockAlert, ...updateDto };

      mockAlertService.update.mockResolvedValue(updatedAlert);

      const result = await controller.update(1, updateDto);

      expect(result).toEqual(updatedAlert);
      expect(mockAlertService.update).toHaveBeenCalledWith(1, updateDto);
    });
  });

  describe('resolve', () => {
    it('should mark alert as resolved', async () => {
      const resolvedAlert = { ...mockAlert, status: AlertStatus.RESOLVED };
      mockAlertService.markAsResolved.mockResolvedValue(resolvedAlert);

      const result = await controller.resolve(1);

      expect(result.status).toBe(AlertStatus.RESOLVED);
      expect(mockAlertService.markAsResolved).toHaveBeenCalledWith(1);
    });
  });

  describe('remove', () => {
    it('should delete an alert', async () => {
      mockAlertService.remove.mockResolvedValue(undefined);

      await controller.remove(1);

      expect(mockAlertService.remove).toHaveBeenCalledWith(1);
    });
  });

  describe('findByStatus', () => {
    it('should return alerts filtered by status', async () => {
      const alerts = [mockAlert];
      mockAlertService.findByStatus.mockResolvedValue(alerts);

      const result = await mockAlertService.findByStatus(AlertStatus.ACTIVE);

      expect(result).toEqual(alerts);
    });
  });
});

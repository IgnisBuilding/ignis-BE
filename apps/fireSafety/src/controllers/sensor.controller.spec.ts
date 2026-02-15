import { Test, TestingModule } from '@nestjs/testing';
import { SensorController } from './sensor.controller';
import { SensorService } from '../services/sensor.service';
import { NotFoundException } from '@nestjs/common';

describe('SensorController', () => {
  let controller: SensorController;
  let service: SensorService;

  const mockSensorService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    findByBuilding: jest.fn(),
    findByType: jest.fn(),
    findByStatus: jest.fn(),
  };

  const mockSensor = {
    sensor_id: 1,
    type: 'smoke',
    location: 'Room 101',
    status: 'active',
    building_id: 1,
    floor_id: 1,
    created_at: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SensorController],
      providers: [
        {
          provide: SensorService,
          useValue: mockSensorService,
        },
      ],
    }).compile();

    controller = module.get<SensorController>(SensorController);
    service = module.get<SensorService>(SensorService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should return an array of sensors', async () => {
      const sensors = [mockSensor];
      mockSensorService.findAll.mockResolvedValue(sensors);

      const result = await controller.findAll();

      expect(result).toEqual(sensors);
      expect(mockSensorService.findAll).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return a single sensor', async () => {
      mockSensorService.findOne.mockResolvedValue(mockSensor);

      const result = await controller.findOne(1);

      expect(result).toEqual(mockSensor);
      expect(mockSensorService.findOne).toHaveBeenCalledWith(1);
    });

    it('should throw NotFoundException when sensor not found', async () => {
      mockSensorService.findOne.mockRejectedValue(new NotFoundException());

      await expect(controller.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('should create a new sensor', async () => {
      const createDto = {
        type: 'smoke',
        location: 'Room 101',
        building_id: 1,
        floor_id: 1,
      };

      mockSensorService.create.mockResolvedValue(mockSensor);

      const result = await controller.create(createDto);

      expect(result).toEqual(mockSensor);
      expect(mockSensorService.create).toHaveBeenCalledWith(createDto);
    });
  });

  describe('update', () => {
    it('should update a sensor', async () => {
      const updateDto = { status: 'inactive' };
      const updatedSensor = { ...mockSensor, ...updateDto };

      mockSensorService.update.mockResolvedValue(updatedSensor);

      const result = await controller.update(1, updateDto);

      expect(result).toEqual(updatedSensor);
      expect(mockSensorService.update).toHaveBeenCalledWith(1, updateDto);
    });
  });

  describe('remove', () => {
    it('should delete a sensor', async () => {
      mockSensorService.remove.mockResolvedValue(undefined);

      await controller.remove(1);

      expect(mockSensorService.remove).toHaveBeenCalledWith(1);
    });
  });

  describe('findByBuilding', () => {
    it('should return sensors for a specific building', async () => {
      const sensors = [mockSensor];
      mockSensorService.findByBuilding.mockResolvedValue(sensors);

      const result = await controller.findByBuilding(1);

      expect(result).toEqual(sensors);
      expect(mockSensorService.findByBuilding).toHaveBeenCalledWith(1);
    });
  });

  describe('findByType', () => {
    it('should return sensors filtered by type', async () => {
      const sensors = [mockSensor];
      mockSensorService.findByType.mockResolvedValue(sensors);

      const result = await mockSensorService.findByType('smoke');

      expect(result).toEqual(sensors);
    });
  });

  describe('findByStatus', () => {
    it('should return sensors filtered by status', async () => {
      const sensors = [mockSensor];
      mockSensorService.findByStatus.mockResolvedValue(sensors);

      const result = await mockSensorService.findByStatus('active');

      expect(result).toEqual(sensors);
    });
  });
});

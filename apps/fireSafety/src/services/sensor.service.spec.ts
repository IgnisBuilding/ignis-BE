import { Test, TestingModule } from '@nestjs/testing';
import { SensorService } from './sensor.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Sensor } from '@app/entities';
import { Repository } from 'typeorm';
import { NotFoundException } from '@nestjs/common';

describe('SensorService', () => {
  let service: SensorService;
  let repository: Repository<Sensor>;

  const mockSensorRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockSensor = {
    sensor_id: 1,
    type: 'smoke',
    location: 'Room 101',
    status: 'active',
    building_id: 1,
    floor_id: 1,
    last_maintenance: new Date(),
    created_at: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SensorService,
        {
          provide: getRepositoryToken(Sensor),
          useValue: mockSensorRepository,
        },
      ],
    }).compile();

    service = module.get<SensorService>(SensorService);
    repository = module.get<Repository<Sensor>>(getRepositoryToken(Sensor));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return an array of sensors', async () => {
      const sensors = [mockSensor];
      mockSensorRepository.find.mockResolvedValue(sensors);

      const result = await service.findAll();

      expect(result).toEqual(sensors);
      expect(mockSensorRepository.find).toHaveBeenCalled();
    });

    it('should return empty array when no sensors exist', async () => {
      mockSensorRepository.find.mockResolvedValue([]);

      const result = await service.findAll();

      expect(result).toEqual([]);
    });
  });

  describe('findOne', () => {
    it('should return a single sensor', async () => {
      mockSensorRepository.findOne.mockResolvedValue(mockSensor);

      const result = await service.findOne(1);

      expect(result).toEqual(mockSensor);
      expect(mockSensorRepository.findOne).toHaveBeenCalledWith({
        where: { sensor_id: 1 },
      });
    });

    it('should throw NotFoundException when sensor not found', async () => {
      mockSensorRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('should create a new sensor', async () => {
      const createSensorDto = {
        type: 'smoke',
        location: 'Room 101',
        building_id: 1,
        floor_id: 1,
      };

      mockSensorRepository.create.mockReturnValue(mockSensor);
      mockSensorRepository.save.mockResolvedValue(mockSensor);

      const result = await service.create(createSensorDto);

      expect(result).toEqual(mockSensor);
      expect(mockSensorRepository.create).toHaveBeenCalledWith(createSensorDto);
      expect(mockSensorRepository.save).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should update a sensor', async () => {
      const updateDto = { status: 'inactive' };
      const updatedSensor = { ...mockSensor, ...updateDto };

      mockSensorRepository.findOne.mockResolvedValue(mockSensor);
      mockSensorRepository.save.mockResolvedValue(updatedSensor);

      const result = await service.update(1, updateDto);

      expect(result).toEqual(updatedSensor);
      expect(mockSensorRepository.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException when sensor not found', async () => {
      mockSensorRepository.findOne.mockResolvedValue(null);

      await expect(service.update(999, {})).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should delete a sensor', async () => {
      mockSensorRepository.findOne.mockResolvedValue(mockSensor);
      mockSensorRepository.delete.mockResolvedValue({ affected: 1 });

      await service.remove(1);

      expect(mockSensorRepository.delete).toHaveBeenCalledWith(1);
    });

    it('should throw NotFoundException when sensor not found', async () => {
      mockSensorRepository.findOne.mockResolvedValue(null);

      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByBuilding', () => {
    it('should return sensors for a specific building', async () => {
      const buildingSensors = [mockSensor];
      mockSensorRepository.find.mockResolvedValue(buildingSensors);

      const result = await service.findByBuilding(1);

      expect(result).toEqual(buildingSensors);
      expect(mockSensorRepository.find).toHaveBeenCalledWith({
        where: { building_id: 1 },
      });
    });
  });

  describe('findByType', () => {
    it('should return sensors filtered by type', async () => {
      const typedSensors = [mockSensor];
      mockSensorRepository.find.mockResolvedValue(typedSensors);

      const result = await service.findByType('smoke');

      expect(result).toEqual(typedSensors);
      expect(mockSensorRepository.find).toHaveBeenCalledWith({
        where: { type: 'smoke' },
      });
    });
  });
});

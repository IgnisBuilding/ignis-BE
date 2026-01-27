import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CameraService } from './camera.service';
import { camera } from '@app/entities';
import { NotFoundException, ConflictException } from '@nestjs/common';

describe('CameraService', () => {
  let service: CameraService;
  let repository: Repository<camera>;

  const mockCamera: Partial<camera> = {
    id: 1,
    name: 'Test Camera',
    camera_id: 'CAM001',
    rtsp_url: 'rtsp://192.168.1.100:554/stream',
    building_id: 1,
    floor_id: 1,
    room_id: 1,
    status: 'active',
    is_fire_detection_enabled: true,
    location_description: 'Main Lobby',
    created_at: new Date(),
    updated_at: new Date(),
  };

  const mockCameraRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
    count: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CameraService,
        {
          provide: getRepositoryToken(camera),
          useValue: mockCameraRepository,
        },
      ],
    }).compile();

    service = module.get<CameraService>(CameraService);
    repository = module.get<Repository<camera>>(getRepositoryToken(camera));

    // Reset all mocks before each test
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('should return all cameras without filters', async () => {
      const cameras = [mockCamera];
      mockCameraRepository.find.mockResolvedValue(cameras);

      const result = await service.findAll();

      expect(result).toEqual(cameras);
      expect(mockCameraRepository.find).toHaveBeenCalledWith({
        where: {},
        relations: ['building', 'floor', 'room'],
        order: { created_at: 'DESC' },
      });
    });

    it('should filter cameras by building_id', async () => {
      const cameras = [mockCamera];
      mockCameraRepository.find.mockResolvedValue(cameras);

      const result = await service.findAll({ building_id: 1 });

      expect(result).toEqual(cameras);
      expect(mockCameraRepository.find).toHaveBeenCalledWith({
        where: { building_id: 1 },
        relations: ['building', 'floor', 'room'],
        order: { created_at: 'DESC' },
      });
    });

    it('should filter cameras by multiple criteria', async () => {
      const cameras = [mockCamera];
      mockCameraRepository.find.mockResolvedValue(cameras);

      const result = await service.findAll({
        building_id: 1,
        floor_id: 2,
        status: 'active',
      });

      expect(result).toEqual(cameras);
      expect(mockCameraRepository.find).toHaveBeenCalledWith({
        where: { building_id: 1, floor_id: 2, status: 'active' },
        relations: ['building', 'floor', 'room'],
        order: { created_at: 'DESC' },
      });
    });
  });

  describe('findOne', () => {
    it('should return a camera by id', async () => {
      mockCameraRepository.findOne.mockResolvedValue(mockCamera);

      const result = await service.findOne(1);

      expect(result).toEqual(mockCamera);
      expect(mockCameraRepository.findOne).toHaveBeenCalledWith({
        where: { id: 1 },
        relations: ['building', 'floor', 'room'],
      });
    });

    it('should throw NotFoundException if camera not found', async () => {
      mockCameraRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByCameraCode', () => {
    it('should return a camera by camera_id code', async () => {
      mockCameraRepository.findOne.mockResolvedValue(mockCamera);

      const result = await service.findByCameraCode('CAM001');

      expect(result).toEqual(mockCamera);
      expect(mockCameraRepository.findOne).toHaveBeenCalledWith({
        where: { camera_id: 'CAM001' },
        relations: ['building', 'floor', 'room'],
      });
    });

    it('should throw NotFoundException if camera code not found', async () => {
      mockCameraRepository.findOne.mockResolvedValue(null);

      await expect(service.findByCameraCode('INVALID')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findByBuilding', () => {
    it('should return all cameras for a building', async () => {
      const cameras = [mockCamera];
      mockCameraRepository.find.mockResolvedValue(cameras);

      const result = await service.findByBuilding(1);

      expect(result).toEqual(cameras);
      expect(mockCameraRepository.find).toHaveBeenCalledWith({
        where: { building_id: 1 },
        relations: ['building', 'floor', 'room'],
        order: { created_at: 'DESC' },
      });
    });
  });

  describe('create', () => {
    const createDto = {
      name: 'New Camera',
      camera_id: 'CAM002',
      rtsp_url: 'rtsp://192.168.1.101:554/stream',
      building_id: 1,
    };

    it('should create a new camera', async () => {
      mockCameraRepository.findOne.mockResolvedValue(null); // No existing camera
      mockCameraRepository.create.mockReturnValue({ ...createDto, id: 2 });
      mockCameraRepository.save.mockResolvedValue({ ...createDto, id: 2 });

      const result = await service.create(createDto);

      expect(result).toEqual({ ...createDto, id: 2 });
      expect(mockCameraRepository.create).toHaveBeenCalled();
      expect(mockCameraRepository.save).toHaveBeenCalled();
    });

    it('should throw ConflictException if camera_id already exists', async () => {
      mockCameraRepository.findOne.mockResolvedValue(mockCamera);

      await expect(
        service.create({ ...createDto, camera_id: 'CAM001' }),
      ).rejects.toThrow(ConflictException);
    });

    it('should set default values for status and fire detection', async () => {
      mockCameraRepository.findOne.mockResolvedValue(null);
      mockCameraRepository.create.mockImplementation((data) => data);
      mockCameraRepository.save.mockImplementation((data) => Promise.resolve(data));

      await service.create(createDto);

      expect(mockCameraRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'active',
          is_fire_detection_enabled: true,
        }),
      );
    });
  });

  describe('update', () => {
    it('should update an existing camera', async () => {
      const updateDto = { name: 'Updated Camera' };
      mockCameraRepository.findOne.mockResolvedValue({ ...mockCamera });
      mockCameraRepository.save.mockResolvedValue({
        ...mockCamera,
        name: 'Updated Camera',
      });

      const result = await service.update(1, updateDto);

      expect(result.name).toBe('Updated Camera');
      expect(mockCameraRepository.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException if camera not found', async () => {
      mockCameraRepository.findOne.mockResolvedValue(null);

      await expect(service.update(999, { name: 'Test' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateStatus', () => {
    it('should update camera status', async () => {
      mockCameraRepository.findOne.mockResolvedValue({ ...mockCamera });
      mockCameraRepository.save.mockResolvedValue({
        ...mockCamera,
        status: 'inactive',
      });

      const result = await service.updateStatus(1, 'inactive');

      expect(result.status).toBe('inactive');
    });
  });

  describe('remove', () => {
    it('should delete a camera', async () => {
      mockCameraRepository.findOne.mockResolvedValue(mockCamera);
      mockCameraRepository.remove.mockResolvedValue(undefined);

      const result = await service.remove(1);

      expect(result).toEqual({ message: 'Camera deleted successfully' });
      expect(mockCameraRepository.remove).toHaveBeenCalledWith(mockCamera);
    });

    it('should throw NotFoundException if camera not found', async () => {
      mockCameraRepository.findOne.mockResolvedValue(null);

      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('getStats', () => {
    it('should return camera statistics', async () => {
      mockCameraRepository.count
        .mockResolvedValueOnce(10) // total
        .mockResolvedValueOnce(7) // active
        .mockResolvedValueOnce(2) // inactive
        .mockResolvedValueOnce(1) // maintenance
        .mockResolvedValueOnce(8); // fireDetectionEnabled

      const result = await service.getStats();

      expect(result).toEqual({
        total: 10,
        active: 7,
        inactive: 2,
        maintenance: 1,
        fireDetectionEnabled: 8,
      });
    });
  });

  describe('getByBuildingStats', () => {
    it('should return camera statistics for a specific building', async () => {
      mockCameraRepository.count
        .mockResolvedValueOnce(5) // total
        .mockResolvedValueOnce(4) // active
        .mockResolvedValueOnce(1); // inactive

      const result = await service.getByBuildingStats(1);

      expect(result).toEqual({
        buildingId: 1,
        total: 5,
        active: 4,
        inactive: 1,
      });
    });
  });
});

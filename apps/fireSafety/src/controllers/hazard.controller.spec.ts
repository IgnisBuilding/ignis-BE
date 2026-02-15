import { Test, TestingModule } from '@nestjs/testing';
import { HazardController } from './hazard.controller';
import { HazardService } from '../services/hazard.service';
import { NotFoundException } from '@nestjs/common';

describe('HazardController', () => {
  let controller: HazardController;
  let service: HazardService;

  const mockHazardService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    findActive: jest.fn(),
    create: jest.fn(),
    updateStatus: jest.fn(),
    respond: jest.fn(),
    resolve: jest.fn(),
    remove: jest.fn(),
    findBySeverity: jest.fn(),
  };

  const mockHazard = {
    hazard_id: 1,
    type: 'fire',
    severity: 'high',
    location: 'Building A - Floor 2',
    status: 'active',
    description: 'Fire detected in kitchen area',
    created_at: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HazardController],
      providers: [
        {
          provide: HazardService,
          useValue: mockHazardService,
        },
      ],
    }).compile();

    controller = module.get<HazardController>(HazardController);
    service = module.get<HazardService>(HazardService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should return an array of hazards', async () => {
      const hazards = [mockHazard];
      mockHazardService.findAll.mockResolvedValue(hazards);

      const result = await controller.findAll();

      expect(result).toEqual(hazards);
      expect(mockHazardService.findAll).toHaveBeenCalled();
    });
  });

  describe('findActive', () => {
    it('should return only active hazards', async () => {
      const activeHazards = [mockHazard];
      mockHazardService.findActive.mockResolvedValue(activeHazards);

      const result = await controller.findActive();

      expect(result).toEqual(activeHazards);
      expect(mockHazardService.findActive).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return a single hazard', async () => {
      mockHazardService.findOne.mockResolvedValue(mockHazard);

      const result = await controller.findOne(1);

      expect(result).toEqual(mockHazard);
      expect(mockHazardService.findOne).toHaveBeenCalledWith(1);
    });

    it('should throw NotFoundException when hazard not found', async () => {
      mockHazardService.findOne.mockRejectedValue(new NotFoundException());

      await expect(controller.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('should create a new hazard', async () => {
      const createDto = {
        type: 'fire',
        severity: 'high',
        location: 'Building A - Floor 2',
        description: 'Fire detected',
      };

      mockHazardService.create.mockResolvedValue(mockHazard);

      const result = await controller.create(createDto);

      expect(result).toEqual(mockHazard);
      expect(mockHazardService.create).toHaveBeenCalledWith(createDto);
    });
  });

  describe('updateStatus', () => {
    it('should update hazard status', async () => {
      const updateDto = { status: 'resolved' };
      const updatedHazard = { ...mockHazard, status: 'resolved' };

      mockHazardService.updateStatus.mockResolvedValue(updatedHazard);

      const result = await controller.updateStatus(1, updateDto);

      expect(result.status).toBe('resolved');
      expect(mockHazardService.updateStatus).toHaveBeenCalledWith(1, updateDto);
    });
  });

  describe('respond', () => {
    it('should mark hazard as responding', async () => {
      const respondingHazard = { ...mockHazard, status: 'responding' };
      mockHazardService.respond.mockResolvedValue(respondingHazard);

      const result = await controller.respond(1);

      expect(result.status).toBe('responding');
      expect(mockHazardService.respond).toHaveBeenCalledWith(1);
    });
  });

  describe('resolve', () => {
    it('should resolve a hazard', async () => {
      const resolvedHazard = { ...mockHazard, status: 'resolved' };
      mockHazardService.resolve.mockResolvedValue(resolvedHazard);

      const result = await mockHazardService.resolve(1);

      expect(result.status).toBe('resolved');
    });
  });

  describe('remove', () => {
    it('should delete a hazard', async () => {
      mockHazardService.remove.mockResolvedValue(undefined);

      await mockHazardService.remove(1);

      expect(mockHazardService.remove).toHaveBeenCalledWith(1);
    });
  });
});

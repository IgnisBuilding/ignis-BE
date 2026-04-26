import { BadRequestException } from '@nestjs/common';
import { ScopeResolverService } from './scope-resolver.service';

describe('ScopeResolverService', () => {
  const buildingRepository = {
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const societyRepository = {
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const apartmentRepository = {
    findOne: jest.fn(),
  };
  const floorRepository = {
    findOne: jest.fn(),
  };

  let service: ScopeResolverService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ScopeResolverService(
      buildingRepository as any,
      societyRepository as any,
      apartmentRepository as any,
      floorRepository as any,
    );
  });

  it('resolves from buildingId', async () => {
    buildingRepository.findOne.mockResolvedValue({
      id: 10,
      name: 'B-10',
      society_id: 2,
    });
    societyRepository.findOne.mockResolvedValue({ id: 2, name: 'S-2' });

    const result = await service.resolve({
      buildingId: 10,
      userId: 1,
      userRole: 'resident',
    });

    expect(result).toEqual({
      level: 'building',
      buildingId: 10,
      buildingName: 'B-10',
      societyId: 2,
      societyName: 'S-2',
      source: 'input_id',
    });
  });

  it('resolves from societyId', async () => {
    societyRepository.findOne.mockResolvedValue({ id: 7, name: 'Soc-7' });

    const result = await service.resolve({
      societyId: 7,
      userId: 1,
      userRole: 'management',
    });

    expect(result).toEqual({
      level: 'society',
      societyId: 7,
      societyName: 'Soc-7',
      source: 'input_id',
    });
  });

  it('resolves from buildingName', async () => {
    const qb = {
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getOne: jest
        .fn()
        .mockResolvedValue({ id: 11, name: 'Tower A', society_id: 3 }),
    };
    buildingRepository.createQueryBuilder.mockReturnValue(qb);
    societyRepository.findOne.mockResolvedValue({
      id: 3,
      name: 'Main Society',
    });

    const result = await service.resolve({
      buildingName: '  tower a ',
      userId: 1,
      userRole: 'resident',
    });

    expect(result.level).toBe('building');
    expect(result.buildingId).toBe(11);
    expect(result.source).toBe('input_name');
  });

  it('resolves from societyName', async () => {
    const qb = {
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue({ id: 8, name: 'Society Eight' }),
    };
    societyRepository.createQueryBuilder.mockReturnValue(qb);

    const result = await service.resolve({
      societyName: ' society eight ',
      userId: 1,
      userRole: 'resident',
    });

    expect(result).toEqual({
      level: 'society',
      societyId: 8,
      societyName: 'Society Eight',
      source: 'input_name',
    });
  });

  it('falls back to user default scope', async () => {
    apartmentRepository.findOne.mockResolvedValue({ floor_id: 101 });
    floorRepository.findOne.mockResolvedValue({ id: 101, building_id: 5 });
    buildingRepository.findOne.mockResolvedValue({
      id: 5,
      name: 'B5',
      society_id: 9,
    });
    societyRepository.findOne.mockResolvedValue({ id: 9, name: 'S9' });

    const result = await service.resolve({
      userId: 42,
      userRole: 'resident',
    });

    expect(result.level).toBe('building');
    expect(result.buildingId).toBe(5);
    expect(result.source).toBe('user_default');
  });

  it('degrades building->society->global when needed', async () => {
    const result = await service.resolve({
      contextMode: 'building',
      societyId: 12,
      userId: 3,
      userRole: 'management',
    });
    expect(result.level).toBe('society');

    const buildingLookupQb = {
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
    };
    buildingRepository.createQueryBuilder.mockReturnValue(buildingLookupQb);

    await expect(
      service.resolve({
        contextMode: 'building',
        buildingName: 'unknown tower',
        userId: 1,
        userRole: 'resident',
      }),
    ).rejects.toThrow(BadRequestException);
  });
});

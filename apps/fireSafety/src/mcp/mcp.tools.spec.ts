import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Sensor, fire_detection_log, hazards } from '@app/entities';
import { McpToolsService } from './mcp.tools';

describe('McpToolsService', () => {
  let service: McpToolsService;

  const hazardRepository = {
    count: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const sensorRepository = { count: jest.fn() };
  const fireLogRepository = { find: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        McpToolsService,
        { provide: getRepositoryToken(hazards), useValue: hazardRepository },
        { provide: getRepositoryToken(Sensor), useValue: sensorRepository },
        {
          provide: getRepositoryToken(fire_detection_log),
          useValue: fireLogRepository,
        },
      ],
    }).compile();

    service = module.get<McpToolsService>(McpToolsService);
    jest.clearAllMocks();
  });

  it('returns risk summary counters', async () => {
    hazardRepository.count
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(5);
    sensorRepository.count.mockResolvedValueOnce(14).mockResolvedValueOnce(2);

    const result = await service.queryRiskSummary();
    expect(result.totalHazards).toBe(10);
    expect(result.activeHazards).toBe(3);
    expect(result.resolvedHazards).toBe(5);
    expect(result.activeSensors).toBe(14);
    expect(result.alertSensors).toBe(2);
  });

  it('returns active hazards context', async () => {
    const take = jest.fn().mockReturnThis();
    const orderBy = jest.fn().mockReturnThis();
    const where = jest.fn().mockReturnThis();
    const leftJoin = jest.fn().mockReturnThis();
    const andWhere = jest.fn().mockReturnThis();
    const getMany = jest.fn().mockResolvedValue([
      {
        id: 1,
        type: 'fire',
        severity: 'high',
        status: 'active',
        created_at: new Date('2026-01-01T00:00:00Z'),
      },
    ]);

    hazardRepository.createQueryBuilder.mockReturnValue({
      where,
      orderBy,
      take,
      leftJoin,
      andWhere,
      getMany,
    });

    const result = await service.getActiveHazardsContext({ limit: 10 });
    expect(result.count).toBe(1);
    expect(result.hazards[0].id).toBe(1);
  });
});

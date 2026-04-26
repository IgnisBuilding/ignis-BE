import { SafetyEngineService } from './safety-engine.service';

describe('SafetyEngineService', () => {
  const hazardRepository = {
    createQueryBuilder: jest.fn(),
  };
  const buildingRepository = {
    find: jest.fn(),
  };
  const floorRepository = {};

  let service: SafetyEngineService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SafetyEngineService(
      hazardRepository as any,
      buildingRepository as any,
      floorRepository as any,
    );
  });

  it('override at building scope with critical hazard', async () => {
    jest.spyOn(service as any, 'getBuildingHazardSnapshot').mockResolvedValue({
      activeCount: 1,
      criticalCount: 1,
      confirmedCriticalCount: 0,
    });

    const result = await service.check({
      userId: 1,
      userRole: 'resident',
      language: 'en',
      message: 'status?',
      scope: { level: 'building', buildingId: 99, source: 'input_id' },
    });

    expect(result.override).toBe(true);
    expect(result.response?.mode).toBe('emergency');
  });

  it('society/global behavior differs correctly', async () => {
    jest
      .spyOn(service as any, 'getSocietyBuildingIds')
      .mockResolvedValue([1, 2]);
    jest.spyOn(service as any, 'getSnapshotsForBuildings').mockResolvedValue([
      { activeCount: 3, criticalCount: 1, confirmedCriticalCount: 0 },
      { activeCount: 0, criticalCount: 0, confirmedCriticalCount: 0 },
    ]);
    jest.spyOn(service as any, 'getGlobalHazardSnapshot').mockResolvedValue({
      activeCount: 1,
      criticalCount: 1,
      confirmedCriticalCount: 0,
    });

    const societyResult = await service.check({
      userId: 1,
      userRole: 'firefighter',
      language: 'en',
      message: 'status?',
      scope: { level: 'society', societyId: 5, source: 'input_id' },
    });
    const globalResult = await service.check({
      userId: 1,
      userRole: 'firefighter',
      language: 'en',
      message: 'status?',
      scope: { level: 'global', source: 'user_default' },
    });

    expect(societyResult.override).toBe(true);
    expect(globalResult.override).toBe(false);
  });
});

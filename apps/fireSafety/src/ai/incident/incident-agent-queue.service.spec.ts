import { IncidentAgentQueueService } from './incident-agent-queue.service';

describe('IncidentAgentQueueService', () => {
  const sessionRepo = {
    findOne: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => ({ ...value, id: 'session-1' })),
    update: jest.fn(),
  };
  const messageRepo = {
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value),
  };
  const notificationRepo = {
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    sessionRepo.findOne.mockResolvedValue({ id: 'session-1', title: 'Incident #7' });
  });

  it('persists degraded metadata when ignis-AI cannot be reached', async () => {
    const service = new IncidentAgentQueueService(
      sessionRepo as any,
      messageRepo as any,
      notificationRepo as any,
    );

    jest.spyOn(service as any, 'callIgnisAiWithRetry').mockRejectedValue(new Error('offline'));

    await (service as any).processJob({
      hazardId: 7,
      severity: 'high',
      chatMessage: 'Fire hazard 7 created.',
      chatContext: { camera_id: 'cam-a' },
      detectionEvents: [],
    });

    expect(messageRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          degraded_mode: true,
          degraded_reason: 'offline',
        }),
      }),
    );
    expect(notificationRepo.save).toHaveBeenCalled();
  });
});

import { ChatOrchestratorService } from './chat-orchestrator.service';

describe('ChatOrchestratorService', () => {
  const scopeResolverService = {
    resolve: jest.fn(),
  };
  const safetyEngineService = {
    check: jest.fn(),
  };
  const contextBuilderService = {
    build: jest.fn(),
  };
  const promptBuilderService = {
    build: jest.fn(),
  };
  const llmRouterService = {
    generate: jest.fn(),
  };

  let service: ChatOrchestratorService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ChatOrchestratorService(
      scopeResolverService as any,
      safetyEngineService as any,
      contextBuilderService as any,
      promptBuilderService as any,
      llmRouterService as any,
    );
  });

  it('calls services in strict order', async () => {
    scopeResolverService.resolve.mockResolvedValue({
      level: 'building',
      buildingId: 1,
      source: 'input_id',
    });
    safetyEngineService.check.mockResolvedValue({ override: false });
    contextBuilderService.build.mockResolvedValue({
      systemPromptContext: 'ctx',
    });
    promptBuilderService.build.mockReturnValue({
      systemPrompt: 'sys',
      userPrompt: 'msg',
    });
    llmRouterService.generate.mockResolvedValue('ok');

    await service.orchestrate({ message: 'test', language: 'en' } as any, {
      userId: 1,
      role: 'resident',
    });

    const a = scopeResolverService.resolve.mock.invocationCallOrder[0];
    const b = safetyEngineService.check.mock.invocationCallOrder[0];
    const c = contextBuilderService.build.mock.invocationCallOrder[0];
    const d = promptBuilderService.build.mock.invocationCallOrder[0];
    const e = llmRouterService.generate.mock.invocationCallOrder[0];

    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
    expect(c).toBeLessThan(d);
    expect(d).toBeLessThan(e);
  });

  it('emergency short-circuit works', async () => {
    scopeResolverService.resolve.mockResolvedValue({
      level: 'building',
      buildingId: 1,
      source: 'input_id',
    });
    safetyEngineService.check.mockResolvedValue({
      override: true,
      response: {
        text: 'Emergency now',
        voiceText: 'Emergency now',
        mode: 'emergency',
        priority: 'high',
        language: 'en',
      },
    });

    const result = await service.orchestrate({
      message: 'test',
      language: 'en',
    } as any);

    expect(result.mode).toBe('emergency');
    expect(contextBuilderService.build).not.toHaveBeenCalled();
    expect(promptBuilderService.build).not.toHaveBeenCalled();
    expect(llmRouterService.generate).not.toHaveBeenCalled();
  });

  it('normal flow returns mode=normal', async () => {
    scopeResolverService.resolve.mockResolvedValue({
      level: 'global',
      source: 'user_default',
    });
    safetyEngineService.check.mockResolvedValue({ override: false });
    contextBuilderService.build.mockResolvedValue({
      systemPromptContext: 'ctx',
    });
    promptBuilderService.build.mockReturnValue({
      systemPrompt: 'sys',
      userPrompt: 'msg',
    });
    llmRouterService.generate.mockResolvedValue('Normal answer');

    const result = await service.orchestrate({
      message: 'hello',
      language: 'en',
    } as any);

    expect(result.mode).toBe('normal');
    expect(result.text).toBe('Normal answer');
    expect(result.voice.priority).toBe('normal');
  });
});

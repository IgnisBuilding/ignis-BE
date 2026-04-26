import { Test, TestingModule } from '@nestjs/testing';
import { McpProxyService } from './mcp-proxy.service';
import { McpServerService } from './mcp.server';

describe('McpProxyService', () => {
  let service: McpProxyService;

  const mcpServerServiceMock = {
    getRetryCount: jest.fn(),
    getToolTimeoutMs: jest.fn(),
    callTool: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        McpProxyService,
        { provide: McpServerService, useValue: mcpServerServiceMock },
      ],
    }).compile();

    service = module.get<McpProxyService>(McpProxyService);
    jest.clearAllMocks();
  });

  it('returns tool result when call succeeds', async () => {
    mcpServerServiceMock.getRetryCount.mockReturnValue(0);
    mcpServerServiceMock.getToolTimeoutMs.mockReturnValue(1000);
    mcpServerServiceMock.callTool.mockResolvedValue({ ok: true });

    const result = await service.callTool('query_risk_summary', {});
    expect(result).toEqual({ ok: true });
  });

  it('normalizes error after retries', async () => {
    mcpServerServiceMock.getRetryCount.mockReturnValue(1);
    mcpServerServiceMock.getToolTimeoutMs.mockReturnValue(1000);
    mcpServerServiceMock.callTool.mockRejectedValue(
      new Error('upstream failure'),
    );

    await expect(service.callTool('query_risk_summary', {})).rejects.toThrow(
      'MCP proxy request failed: upstream failure',
    );
  });

  it('injects buildingId into tool args when known', async () => {
    jest.spyOn(service as any, 'planToolUsage').mockResolvedValue({
      action: 'tool_call',
      toolName: 'query_risk_summary',
      args: {},
    });
    const callToolSpy = jest
      .spyOn(service, 'callTool')
      .mockResolvedValue({ activeHazards: 1 });
    jest
      .spyOn(service as any, 'generateGroundedAnswer')
      .mockResolvedValue('scoped answer');

    const result = await service.chatWithAssistant('status', undefined, {
      scopeLevel: 'building',
      buildingId: 55,
    });

    expect(result.answer).toBe('scoped answer');
    expect(callToolSpy).toHaveBeenCalledWith('query_risk_summary', {
      buildingId: 55,
    });
  });

  it('does not run broad unscoped tool plan when scope required', async () => {
    jest.spyOn(service as any, 'planToolUsage').mockResolvedValue({
      action: 'tool_call',
      toolName: 'get_recent_fire_detections',
      args: {},
    });
    const callToolSpy = jest.spyOn(service, 'callTool');

    const result = await service.chatWithAssistant('status', undefined, {
      scopeLevel: 'building',
      buildingId: 55,
    });

    expect(callToolSpy).not.toHaveBeenCalled();
    expect(result.answer).toContain('cannot safely run a scoped live query');
  });

  it('legacy call without scope still works', async () => {
    jest
      .spyOn(service as any, 'planToolUsage')
      .mockResolvedValue({ action: 'respond', response: 'legacy-ok' });

    const result = await service.chatWithAssistant('hello');
    expect(result.answer).toBe('legacy-ok');
  });

  it('timeout-like provider failure triggers fallback path', async () => {
    const executeSpy = jest
      .spyOn(
        service as unknown as {
          executeChatFlow: (...args: unknown[]) => Promise<string>;
        },
        'executeChatFlow',
      )
      .mockRejectedValueOnce(new Error('LLM request timed out after 20ms'))
      .mockResolvedValueOnce('fallback answer');

    const result = await service.chatWithAssistant('hello');

    expect(executeSpy).toHaveBeenCalledTimes(2);
    expect(result.fallbackTriggered).toBe(true);
    expect(result.answer).toBe('fallback answer');
  });
});

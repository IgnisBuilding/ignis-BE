import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { RolesGuard } from '../guards/roles.guard';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatOrchestratorService } from '../ai/orchestrator/chat-orchestrator.service';
import { ScopeResolverService } from '../ai/context/scope-resolver.service';
import { SafetyEngineService } from '../ai/safety/safety-engine.service';
import { ContextBuilderService } from '../ai/context/context-builder.service';
import { PromptBuilderService } from '../ai/prompt-builder/prompt-builder.service';
import { LLMRouterService } from '../ai/llm-router/llm-router.service';
import { McpProxyController } from '../mcp/mcp-proxy.controller';
import { McpProxyService } from '../mcp/mcp-proxy.service';

class TestJwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ user?: unknown }>();
    req.user = { role: 'management', userId: 1 };
    return true;
  }
}

describe('Chat Integration', () => {
  let app: INestApplication;

  const scopeResolverMock = {
    resolve: jest.fn().mockResolvedValue({
      level: 'building',
      buildingId: 10,
      source: 'input_id',
    }),
  };
  const safetyEngineMock = {
    check: jest.fn().mockResolvedValue({ override: false }),
  };
  const contextBuilderMock = {
    build: jest
      .fn()
      .mockResolvedValue({ systemPromptContext: 'ctx', structuredData: {} }),
  };
  const promptBuilderMock = {
    build: jest
      .fn()
      .mockReturnValue({ systemPrompt: 'sys', userPrompt: 'user-msg' }),
  };
  const llmRouterMock = {
    generate: jest.fn().mockResolvedValue('normal response'),
  };
  const mcpProxyServiceMock = {
    callTool: jest.fn().mockResolvedValue({ ok: true }),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [ChatController, McpProxyController],
      providers: [
        RolesGuard,
        ChatService,
        ChatOrchestratorService,
        { provide: ScopeResolverService, useValue: scopeResolverMock },
        { provide: SafetyEngineService, useValue: safetyEngineMock },
        { provide: ContextBuilderService, useValue: contextBuilderMock },
        { provide: PromptBuilderService, useValue: promptBuilderMock },
        { provide: LLMRouterService, useValue: llmRouterMock },
        { provide: McpProxyService, useValue: mcpProxyServiceMock },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(TestJwtAuthGuard)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    scopeResolverMock.resolve.mockResolvedValue({
      level: 'building',
      buildingId: 10,
      source: 'input_id',
    });
    safetyEngineMock.check.mockResolvedValue({ override: false });
    llmRouterMock.generate.mockResolvedValue('normal response');
  });

  it('POST /chat normal flow returns mode=normal and calls router', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    await request(server)
      .post('/chat')
      .send({ message: 'status', language: 'en' })
      .expect(201)
      .expect(({ body }: { body: Record<string, unknown> }) => {
        expect(typeof body['text']).toBe('string');
        expect(body['mode']).toBe('normal');
        const voice = body['voice'] as Record<string, unknown>;
        expect(typeof voice['language']).toBe('string');
      });

    expect(llmRouterMock.generate).toHaveBeenCalled();
  });

  it('POST /chat emergency flow short-circuits router', async () => {
    safetyEngineMock.check.mockResolvedValue({
      override: true,
      response: {
        text: 'Emergency now',
        voiceText: 'Emergency now',
        mode: 'emergency',
        priority: 'high',
        language: 'en',
      },
    });

    const server = app.getHttpServer() as Parameters<typeof request>[0];
    await request(server)
      .post('/chat')
      .send({ message: 'status', language: 'en' })
      .expect(201)
      .expect(({ body }: { body: Record<string, unknown> }) => {
        expect(body['mode']).toBe('emergency');
        const voice = body['voice'] as Record<string, unknown>;
        expect(voice['priority']).toBe('high');
      });

    expect(llmRouterMock.generate).not.toHaveBeenCalled();
  });

});

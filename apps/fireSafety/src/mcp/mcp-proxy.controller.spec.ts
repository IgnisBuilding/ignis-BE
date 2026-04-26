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
import { McpProxyController } from './mcp-proxy.controller';
import { McpProxyService } from './mcp-proxy.service';

class TestJwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ user?: unknown }>();
    req.user = { role: 'admin', userId: 1 };
    return true;
  }
}

describe('McpProxyController', () => {
  let app: INestApplication;

  const mcpProxyServiceMock = {
    callTool: jest.fn().mockResolvedValue({ ok: true }),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [McpProxyController],
      providers: [
        RolesGuard,
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

  it('allows authorized call to query risk summary endpoint', async () => {
    await request(app.getHttpServer())
      .post('/mcp/queryRiskSummary')
      .send({ buildingId: 1 })
      .expect(201)
      .expect(({ body }: { body: Record<string, unknown> }) => {
        expect(body['success']).toBe(true);
        expect(body['toolName']).toBe('query_risk_summary');
      });
  });

});

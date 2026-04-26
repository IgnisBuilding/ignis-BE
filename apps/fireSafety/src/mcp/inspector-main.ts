import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { validateAiConfig } from '../lib/ai-config';

async function bootstrap(): Promise<void> {
  process.env.MCP_TRANSPORT = process.env.MCP_TRANSPORT ?? 'stdio';
  process.env.DB_MIGRATIONS_RUN = process.env.DB_MIGRATIONS_RUN ?? 'false';

  validateAiConfig();

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });

  const shutdown = async () => {
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.stack || error.message : String(error);
  process.stderr.write(`[mcp-inspector] bootstrap failed: ${message}\n`);
  process.exit(1);
});

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe, LogLevel } from '@nestjs/common';
import { validateAiConfig } from './lib/ai-config';

async function bootstrap() {
  validateAiConfig();

  const logLevels = (process.env.NEST_LOG_LEVELS || 'warn,error')
    .split(',')
    .map((level) => level.trim())
    .filter(Boolean) as LogLevel[];

  const app = await NestFactory.create(AppModule, {
    logger: logLevels,
  });

  // Enable CORS for all origins
  app.enableCors({
    origin: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  // Enable validation for all incoming requests based on DTOs
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
  }));

  // The port is defined here! Listen on all network interfaces
  const port = process.env.PORT || 4000;
  await app.listen(port, '0.0.0.0');
  Logger.log(`Fire Safety API is running on: http://0.0.0.0:${port}`, 'Bootstrap');
}
bootstrap();

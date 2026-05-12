import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe, LogLevel } from '@nestjs/common';
import { json, urlencoded } from 'express';

async function bootstrap() {
  const logLevels = (process.env.NEST_LOG_LEVELS || 'warn,error')
    .split(',')
    .map((level) => level.trim())
    .filter(Boolean) as LogLevel[];

  const app = await NestFactory.create(AppModule, {
    logger: logLevels,
    bodyParser: false, // disable default 100 KB limit; we set our own below
  });

  // Raised limit required for floor-plan saves (base64 image + editor state)
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ limit: '50mb', extended: true }));

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

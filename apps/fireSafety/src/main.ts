import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable validation for all incoming requests based on DTOs
  app.useGlobalPipes(new ValidationPipe());

  // The port is defined here!
  await app.listen(3000);
}
bootstrap();
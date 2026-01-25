import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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
  console.log(`🔥 Fire Safety API is running on: http://0.0.0.0:${port}`);
}
bootstrap();

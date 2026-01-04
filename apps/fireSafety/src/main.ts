import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS for frontend
  const allowedOrigins = process.env.ALLOWED_ORIGIN
    ? process.env.ALLOWED_ORIGIN.split(',')
    : ['http://localhost:3000', 'http://192.168.56.1:3000', 'http://localhost:4000', 'http://localhost:5173'];

  app.enableCors({
    origin: allowedOrigins,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  // Enable validation for all incoming requests based on DTOs
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
  }));

  // The port is defined here! Listen on all network interfaces
  await app.listen(7000, '0.0.0.0');
  console.log(`🔥 Fire Safety API is running on: http://0.0.0.0:7000`);
}
bootstrap();

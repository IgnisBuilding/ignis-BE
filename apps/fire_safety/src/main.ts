import { NestFactory } from '@nestjs/core';
import { FireSafetyModule } from './fire_safety.module';

async function bootstrap() {
  const app = await NestFactory.create(FireSafetyModule);
  await app.listen(process.env.port ?? 3000);
}
bootstrap();

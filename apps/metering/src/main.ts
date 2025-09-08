import { NestFactory } from '@nestjs/core';
import { MeteringModule } from './metering.module';

async function bootstrap() {
  const app = await NestFactory.create(MeteringModule);
  await app.listen(process.env.port ?? 3000);
}
bootstrap();

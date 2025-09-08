import { NestFactory } from '@nestjs/core';
import { SocietyManagementModule } from './society-management.module';

async function bootstrap() {
  const app = await NestFactory.create(SocietyManagementModule);
  await app.listen(process.env.port ?? 3000);
}
bootstrap();

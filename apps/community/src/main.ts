import { NestFactory } from '@nestjs/core';
import { CommunityModule } from './community.module';

async function bootstrap() {
  const app = await NestFactory.create(CommunityModule);
  await app.listen(process.env.port ?? 3000);
}
bootstrap();

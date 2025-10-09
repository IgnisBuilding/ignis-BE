import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { FireSafetyModule } from './fire_safety.module';
import { Node } from '@app/entities';
import { Edge } from '@app/entities';
import { EvacuationRoute } from '@app/entities';
// Import other shared entities as needed

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: './apps/evacuation-service/.env' }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('DB_HOST'),
        port: configService.get<number>('DB_PORT'),
        username: configService.get<string>('DB_USERNAME'),
        password: configService.get<string>('DB_PASSWORD'),
        database: configService.get<string>('DB_NAME'),
        // Path assumes monorepo structure where entities are in a lib
        entities: [Node, Edge, EvacuationRoute],
        synchronize: false, // Never use TRUE in production!
      }),
    }),
    FireSafetyModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
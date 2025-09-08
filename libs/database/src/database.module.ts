import { Module } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { TypeOrmModule } from '@nestjs/typeorm';


@Module({
  imports :[
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      // 👇 Entities tell TypeORM how your schema should look
      entities: [__dirname + '/../**/*.entity{.ts,.js}'],

      // 👇 Migrations tell TypeORM how to safely apply schema changes
      migrations: [__dirname + '/../migrations/*{.ts,.js}'],
      autoLoadEntities: true,
      synchronize: false,
    })
  ]
})
export class DatabaseModule {}

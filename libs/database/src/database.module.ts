import { Module } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { Society } from './entities/society.entity';
import { notification } from './entities/notification.entity';
import { payment } from './entities/payment.entity';
import {bill} from './entities/bill.entity';
import {appartment} from './entities/apartment.entity';
import {bill_split} from './entities/bill_split.entity';
import { building } from './entities/building.entity';
import { floor } from './entities/floor.entity';
import { incident_log } from './entities/incident_log.entity';
import { meter } from './entities/meter.entity';
import {meter_reading} from './entities/meter_reading.entity';
import {sensor} from './entities/sensor.entity';
import {sensor_log} from './entities/sensor_log.entity';
import {nodes} from './entities/nodes.entity';
import { exits } from './entities/exits.entity';
import { edges } from './entities/edges.entity';
import { hazards } from './entities/hazards.entity';

@Module({
  imports :[
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USER,
      password: process.env.DB_PASS,
      database: process.env.DB_NAME,
      entities: [Society, notification, payment, bill, appartment, bill_split, building, floor, incident_log, meter, meter_reading, sensor, sensor_log, nodes, exits, edges, hazards],
      synchronize: false,
      logging: true,
      migrations: [__dirname + '/migrations/*.ts']
    })
  ]
})
export class DatabaseModule {}

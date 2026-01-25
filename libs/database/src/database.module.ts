import { Module } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { Society } from './entities/society.entity';
import { notification } from './entities/notification.entity';
import { payment } from './entities/payment.entity';
import { bill } from './entities/bill.entity';
import { apartment } from './entities/apartment.entity';
import { bill_split } from './entities/bill_split.entity';
import { building } from './entities/building.entity';
import { floor } from './entities/floor.entity';
import { incident_log } from './entities/incident_log.entity';
import { meter } from './entities/meter.entity';
import { meter_reading } from './entities/meter_reading.entity';
import { sensor_log } from './entities/sensor_log.entity';
import { nodes } from './entities/nodes.entity';
import { exits } from './entities/exits.entity';
import { edges } from './entities/edges.entity';
import { hazards } from './entities/hazards.entity';
import { EvacuationRoute } from './entities/evacuation_route.entity';
import { room } from './entities/room.entity';
import { User } from './entities/user.entity';
import { Sensor } from './entities/sensor.entity';
import { Resident } from './entities/resident.entity';
import { rescue_teams } from './entities/rescue_teams.entity';
import { trapped_occupants } from './entities/trapped_occupants.entity';
import { isolation_events } from './entities/isolation_events.entity';

@Module({
  imports: [
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
      ssl: { rejectUnauthorized: false },
      entities: [
        Society,
        notification,
        payment,
        bill,
        apartment,
        bill_split,
        building,
        floor,
        incident_log,
        meter,
        meter_reading,
        sensor_log,
        nodes,
        exits,
        edges,
        hazards,
        EvacuationRoute,
        room,
        User,
        Sensor,
        Resident,
        rescue_teams,
        trapped_occupants,
        isolation_events,
      ],
      synchronize: false,
      logging: true,
      migrations: [__dirname + '/migrations/*.ts'],
    }),
  ],
})
export class DatabaseModule {}


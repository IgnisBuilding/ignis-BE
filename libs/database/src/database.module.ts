import { Module } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { Society } from './entities/society.entity';
import { Notification } from './entities/notification.entity';
import { payment } from './entities/payment.entity';
import { bill } from './entities/bill.entity';
import { apartment } from './entities/apartment.entity';
import { bill_split } from './entities/bill_split.entity';
import { building } from './entities/building.entity';
import { floor } from './entities/floor.entity';
import { IncidentLog } from './entities/incident_log.entity';
import { meter } from './entities/meter.entity';
import { meter_reading } from './entities/meter_reading.entity';
import { SensorLog } from './entities/sensor_log.entity';
import { nodes } from './entities/nodes.entity';
import { Opening } from './entities/opening.entity';
import { OpeningRoom } from './entities/opening_room.entity';
import { edges } from './entities/edges.entity';
import { hazards } from './entities/hazards.entity';
import { EvacuationRoute } from './entities/evacuation_route.entity';
import { room } from './entities/room.entity';
import { User } from './entities/user.entity';
import { Sensor } from './entities/sensor.entity';
import { rescue_teams } from './entities/rescue_teams.entity';
import { trapped_occupants } from './entities/trapped_occupants.entity';
import { isolation_events } from './entities/isolation_events.entity';
import { camera } from './entities/camera.entity';
import { fire_detection_log } from './entities/fire_detection_log.entity';
import { fire_alert_config } from './entities/fire_alert_config.entity';
import { SafePoint } from './entities/safe_point.entity';
import { UserPosition } from './entities/user-position.entity';
import { UserPositionHistory } from './entities/user-position-history.entity';
import { NavigationSession } from './entities/navigation-session.entity';
import { Alert } from './entities/alert.entity';
import { SafetyEquipment } from './entities/safety_equipment.entity';
import { Fingerprint } from './entities/fingerprint.entity';
import { UserSettings } from './entities/user-settings.entity';

const DB_LOGGING = (process.env.DB_LOGGING || 'false').toLowerCase() === 'true';

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
        Notification,
        payment,
        bill,
        apartment,
        bill_split,
        building,
        floor,
        IncidentLog,
        meter,
        meter_reading,
        SensorLog,
        nodes,
        Opening,
        OpeningRoom,
        edges,
        hazards,
        EvacuationRoute,
        room,
        User,
        Sensor,
        rescue_teams,
        trapped_occupants,
        isolation_events,
        camera,
        fire_detection_log,
        fire_alert_config,
        SafePoint,
        UserPosition,
        UserPositionHistory,
        NavigationSession,
        Alert,
        SafetyEquipment,
        Fingerprint,
        UserSettings,
      ],
      synchronize: false,
      migrationsRun: true,
      logging: DB_LOGGING,
      migrations: [__dirname + '/migrations/*{.ts,.js}'],
    }),
  ],
})
export class DatabaseModule {}


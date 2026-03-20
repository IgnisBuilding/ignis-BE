import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { FireSafetyController } from './fire_safety.controller';
import { FireSafetyService } from './fire_safety.service';
import {
  edges,
  EvacuationRoute,
  nodes,
  building,
  floor,
  apartment,
  room,
  Opening,
  OpeningRoom,
  hazards,
  User,
  Sensor,
  Alert,
  SafetyEquipment,
  rescue_teams,
  trapped_occupants,
  isolation_events,
  Society,
  camera,
  fire_detection_log,
  fire_alert_config,
  UserPosition,
  UserPositionHistory,
  NavigationSession,
  SafePoint,
  Fingerprint,
  Notification,
  UserSettings,
  Employee,
  FireBrigade,
  FireBrigadeState,
  FireBrigadeHQ,
} from '@app/entities';
import { AuthController } from './controllers/auth.controller';
import { SensorController } from './controllers/sensor.controller';
import { ResidentController } from './controllers/resident.controller';
import { BuildingController } from './controllers/building.controller';
import { DashboardController } from './controllers/dashboard.controller';
import { AlertController } from './controllers/alert.controller';
import { HazardController } from './controllers/hazard.controller';
import { SafetyEquipmentController } from './controllers/safety-equipment.controller';
import { ApartmentController } from './controllers/apartment.controller';
import { CameraController } from './controllers/camera.controller';
import { FireDetectionController } from './controllers/fire-detection.controller';
import { FloorController } from './controllers/floor.controller';
import { NavigationController } from './controllers/navigation.controller';
import { FingerprintController } from './controllers/fingerprint.controller';
import { SettingsController } from './controllers/settings.controller';
import { NotificationController } from './controllers/notification.controller';
import { EmployeeController } from './controllers/employee.controller';
import { FingerprintService } from './services/fingerprint.service';
import { SettingsService } from './services/settings.service';
import { NotificationService } from './services/notification.service';
import { EmployeeService } from './services/employee.service';
import { ArduinoSensorService } from './services/arduino-sensor.service';
import { AuthService } from './services/auth.service';
import { SensorService } from './services/sensor.service';
import { AlertService } from './services/alert.service';
import { HazardService } from './services/hazard.service';
import { SafetyEquipmentService } from './services/safety-equipment.service';
import { ApartmentService } from './services/apartment.service';
import { CameraService } from './services/camera.service';
import { FireDetectionService } from './services/fire-detection.service';
import { IsolationDetectionService } from './isolation-detection.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { FireDetectionGateway } from './gateways/fire-detection.gateway';
import { NavigationGateway } from './gateways/navigation.gateway';
import { NavigationService } from './services/navigation.service';

@Module({
  imports: [
    ConfigModule.forRoot(),
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get('JWT_SECRET') || 'your-secret-key-change-in-production',
        signOptions: { expiresIn: '24h' },
      }),
      inject: [ConfigService],
    }),
    TypeOrmModule.forFeature([
      EvacuationRoute,
      nodes,
      edges,
      building,
      floor,
      apartment,
      room,
      Opening,
      OpeningRoom,
      hazards,
      User,
      Sensor,
      Alert,
      SafetyEquipment,
      rescue_teams,
      trapped_occupants,
      isolation_events,
      Society,
      camera,
      fire_detection_log,
      fire_alert_config,
      UserPosition,
      UserPositionHistory,
      NavigationSession,
      SafePoint,
      Fingerprint,
      Notification,
      UserSettings,
      Employee,
      FireBrigade,
      FireBrigadeState,
      FireBrigadeHQ,
    ]),
  ],
  controllers: [
    FireSafetyController,
    AuthController,
    SensorController,
    ResidentController,
    BuildingController,
    DashboardController,
    AlertController,
    HazardController,
    SafetyEquipmentController,
    ApartmentController,
    CameraController,
    FireDetectionController,
    FloorController,
    NavigationController,
    FingerprintController,
    SettingsController,
    NotificationController,
    EmployeeController,
  ],
  providers: [
    FireSafetyService,
    AuthService,
    SensorService,
    AlertService,
    HazardService,
    SafetyEquipmentService,
    ApartmentService,
    IsolationDetectionService,
    JwtStrategy,
    CameraService,
    FireDetectionService,
    FireDetectionGateway,
    NavigationService,
    NavigationGateway,
    FingerprintService,
    SettingsService,
    NotificationService,
    EmployeeService,
    ArduinoSensorService,
  ],
})
export class FireSafetyModule {}

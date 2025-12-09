import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { FireSafetyController } from './fire_safety.controller';
import { FireSafetyService } from './fire_safety.service';
import { edges, EvacuationRoute, nodes, building, floor, apartment, room, exits, hazards, User, Sensor, Resident, Alert, SafetyEquipment } from '@app/entities';
import { AuthController } from './controllers/auth.controller';
import { SensorController } from './controllers/sensor.controller';
import { ResidentController } from './controllers/resident.controller';
import { BuildingController } from './controllers/building.controller';
import { DashboardController } from './controllers/dashboard.controller';
import { AlertController } from './controllers/alert.controller';
import { HazardController } from './controllers/hazard.controller';
import { SafetyEquipmentController } from './controllers/safety-equipment.controller';
import { ApartmentController } from './controllers/apartment.controller';
import { AuthService } from './services/auth.service';
import { SensorService } from './services/sensor.service';
import { ResidentService } from './services/resident.service';
import { AlertService } from './services/alert.service';
import { HazardService } from './services/hazard.service';
import { SafetyEquipmentService } from './services/safety-equipment.service';
import { ApartmentService } from './services/apartment.service';
import { JwtStrategy } from './strategies/jwt.strategy';

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
    TypeOrmModule.forFeature([EvacuationRoute, nodes, edges, building, floor, apartment, room, exits, hazards, User, Sensor, Resident, Alert, SafetyEquipment]),
  ],
  controllers: [FireSafetyController, AuthController, SensorController, ResidentController, BuildingController, DashboardController, AlertController, HazardController, SafetyEquipmentController, ApartmentController],
  providers: [FireSafetyService, AuthService, SensorService, ResidentService, AlertService, HazardService, SafetyEquipmentService, ApartmentService, JwtStrategy],
})
export class FireSafetyModule {}
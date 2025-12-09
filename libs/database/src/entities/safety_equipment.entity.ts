import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { apartment } from './apartment.entity';
import { building } from './building.entity';

export enum EquipmentType {
  FIRE_EXTINGUISHER = 'fire_extinguisher',
  SMOKE_DETECTOR = 'smoke_detector',
  EMERGENCY_EXIT = 'emergency_exit',
  FIRE_ALARM = 'fire_alarm',
  SPRINKLER = 'sprinkler',
  CO_DETECTOR = 'co_detector',
}

export enum EquipmentStatus {
  OK = 'ok',
  DUE = 'due',
  EXPIRED = 'expired',
  NEEDS_MAINTENANCE = 'needs_maintenance',
}

@Entity('safety_equipment')
export class SafetyEquipment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    type: 'enum',
    enum: EquipmentType,
  })
  type: EquipmentType;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({
    type: 'enum',
    enum: EquipmentStatus,
    default: EquipmentStatus.OK,
  })
  status: EquipmentStatus;

  @Column({ type: 'timestamp', name: 'last_checked' })
  lastChecked: Date;

  @Column({ type: 'timestamp', name: 'next_check_due', nullable: true })
  nextCheckDue: Date;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @ManyToOne(() => apartment, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'apartment_id' })
  apartment: apartment;

  @Column({ name: 'apartment_id', nullable: true })
  apartmentId: number;

  @ManyToOne(() => building, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'building_id' })
  building: building;

  @Column({ name: 'building_id', nullable: true })
  buildingId: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

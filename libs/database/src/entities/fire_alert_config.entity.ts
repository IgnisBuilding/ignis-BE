import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { building } from './building.entity';

@Entity()
export class fire_alert_config {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  building_id: number;

  @ManyToOne(() => building)
  @JoinColumn({ name: 'building_id' })
  building: building;

  @Column({ type: 'decimal', precision: 5, scale: 4, default: 0.7 })
  min_confidence: number; // Minimum confidence to trigger alert (default: 70%)

  @Column({ type: 'integer', default: 3 })
  consecutive_detections: number; // Number of consecutive detections needed

  @Column({ type: 'integer', default: 60 })
  cooldown_seconds: number; // Cooldown between alerts for same camera

  @Column({ default: true })
  auto_create_hazard: boolean;

  @Column({ default: true })
  auto_notify_firefighters: boolean;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;

  @Column({
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  updated_at: Date;
}

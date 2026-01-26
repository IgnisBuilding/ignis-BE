import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { camera } from './camera.entity';
import { hazards } from './hazards.entity';

@Entity()
export class fire_detection_log {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  camera_id: number; // FK to camera table

  @ManyToOne(() => camera)
  @JoinColumn({ name: 'camera_id' })
  camera: camera;

  @Column({ length: 50 })
  camera_code: string; // Original camera_id from fire-detect pipeline

  @Column({ type: 'timestamp' })
  detection_timestamp: Date;

  @Column({ type: 'decimal', precision: 5, scale: 4 })
  confidence: number; // 0.0000 to 1.0000

  @Column({ type: 'jsonb', nullable: true })
  bounding_box: object; // {"x1": 100, "y1": 150, "x2": 250, "y2": 300}

  @Column({ type: 'decimal', precision: 6, scale: 3, nullable: true })
  inference_latency: number; // Seconds

  @Column({ default: false })
  alert_triggered: boolean;

  @Column({ nullable: true })
  hazard_id: number; // FK to hazards if alert was created

  @ManyToOne(() => hazards)
  @JoinColumn({ name: 'hazard_id' })
  hazard: hazards;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;
}

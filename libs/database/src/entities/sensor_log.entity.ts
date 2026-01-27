import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Sensor } from './sensor.entity';

@Entity('sensor_log')
export class SensorLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'sensor_id' })
  sensorId: number;

  @ManyToOne(() => Sensor, { nullable: false })
  @JoinColumn({ name: 'sensor_id' })
  sensor: Sensor;

  @Column({ name: 'detection_type' })
  detectionType: string;

  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: true })
  value: number;

  @Column({ type: 'varchar', length: 20, nullable: true })
  unit: string;

  @Column({ name: 'is_alert', type: 'boolean', default: false })
  isAlert: boolean;

  @Column({ name: 'alert_type', type: 'varchar', length: 50, nullable: true })
  alertType: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

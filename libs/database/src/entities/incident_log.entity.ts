import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class incident_log {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  type: number;

  @Column()
  description: string;

  @Column({ type: 'date' })
  reason: string;

  @Column({ type: 'date' })
  severity: string;

  @Column({ type: 'date' })
  apartment_id: number;

  @Column({ type: 'date' })
  floor_id: number;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;

  @Column({
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  updated_at: Date;
}

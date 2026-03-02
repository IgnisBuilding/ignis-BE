import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { apartment } from './apartment.entity';
import { floor } from './floor.entity';

@Entity('incident_log')
export class IncidentLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  type: string;

  @Column()
  description: string;

  @Column({ type: 'text', nullable: true })
  reason: string;

  @Column({ type: 'varchar', nullable: true })
  severity: string;

  @Column({ name: 'apartment_id', nullable: true })
  apartmentId: number;

  @ManyToOne(() => apartment, { nullable: true })
  @JoinColumn({ name: 'apartment_id' })
  apartment: apartment;

  @Column({ name: 'floor_id', nullable: true })
  floorId: number;

  @ManyToOne(() => floor, { nullable: true })
  @JoinColumn({ name: 'floor_id' })
  floor: floor;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

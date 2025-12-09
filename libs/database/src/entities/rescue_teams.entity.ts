import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  JoinColumn,
  ManyToOne,
  OneToOne,
} from 'typeorm';
import { floor } from './floor.entity';

@Entity()
export class rescue_teams {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 50 })
  team_name: string;

  @Column({ length: 10, unique: true })
  team_code: string;

  // Team Composition
  @Column({ type: 'integer', default: 4 })
  member_count: number;

  @Column({ default: false })
  has_medical: boolean;

  @Column({ default: false })
  has_heavy_equipment: boolean;

  // Current Status
  @Column({ length: 20, default: 'AVAILABLE' })
  status: string;

  @Column({ length: 100, nullable: true })
  current_location: string;

  @ManyToOne(() => floor, { nullable: true })
  @JoinColumn({ name: 'current_floor_id' })
  current_floor: floor;

  // Contact Info
  @Column({ length: 20, nullable: true })
  radio_channel: string;

  @Column({ length: 20, nullable: true })
  leader_contact: string;

  // Current Assignment (will be set after trapped_occupants is created)
  @Column({ type: 'integer', nullable: true })
  current_assignment_id: number;

  // Timestamps
  @Column({ type: 'timestamp', default: () => 'NOW()' })
  last_status_update: Date;

  @Column({ type: 'timestamp', default: () => 'NOW()' })
  created_at: Date;
}

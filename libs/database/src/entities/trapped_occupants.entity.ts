import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  JoinColumn,
  ManyToOne,
} from 'typeorm';
import { nodes } from './nodes.entity';
import { floor } from './floor.entity';
import { rescue_teams } from './rescue_teams.entity';

@Entity()
export class trapped_occupants {
  @PrimaryGeneratedColumn()
  id: number;

  // Location Information
  @ManyToOne(() => nodes)
  @JoinColumn({ name: 'node_id' })
  node: nodes;

  @Column({ type: 'integer' })
  node_id: number;

  @ManyToOne(() => floor, { nullable: true })
  @JoinColumn({ name: 'floor_id' })
  floor: floor;

  @Column({ length: 100, nullable: true })
  room_name: string;

  // Occupant Information
  @Column({ type: 'integer', default: 1 })
  occupant_count: number;

  @Column({ default: false })
  has_elderly: boolean;

  @Column({ default: false })
  has_disabled: boolean;

  @Column({ default: false })
  has_children: boolean;

  @Column({ length: 20, nullable: true })
  contact_number: string;

  // Isolation Details
  @Column({ length: 50 })
  isolation_reason: string;

  @Column({ type: 'integer', array: true, nullable: true })
  blocking_hazard_ids: number[];

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  nearest_fire_distance: number;

  // Priority & Status
  @Column({ type: 'integer' })
  priority_score: number;

  @Column({ length: 20 })
  priority_level: string;

  @Column({ length: 30, default: 'TRAPPED' })
  status: string;

  // Shelter Information
  @Column({ type: 'text', nullable: true })
  shelter_instructions: string;

  @Column({ default: false })
  has_window: boolean;

  @Column({ default: false })
  has_external_access: boolean;

  @Column({ type: 'integer', nullable: true })
  room_capacity: number;

  // Rescue Assignment
  @ManyToOne(() => rescue_teams, { nullable: true })
  @JoinColumn({ name: 'assigned_team_id' })
  assigned_team: rescue_teams;

  @Column({ type: 'timestamp', nullable: true })
  estimated_rescue_time: Date;

  @Column({ type: 'timestamp', nullable: true })
  actual_rescue_time: Date;

  // Timestamps
  @Column({ type: 'timestamp', default: () => 'NOW()' })
  trapped_at: Date;

  @Column({ type: 'timestamp', default: () => 'NOW()' })
  last_contact_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  rescued_at: Date;

  @Column({ type: 'timestamp', default: () => 'NOW()' })
  created_at: Date;

  @Column({ type: 'timestamp', default: () => 'NOW()' })
  updated_at: Date;

  // Coordinates for quick access (denormalized from node geometry)
  @Column({ type: 'decimal', precision: 12, scale: 8, nullable: true })
  longitude: number;

  @Column({ type: 'decimal', precision: 12, scale: 8, nullable: true })
  latitude: number;
}

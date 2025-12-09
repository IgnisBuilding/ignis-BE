import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  JoinColumn,
  ManyToOne,
} from 'typeorm';
import { nodes } from './nodes.entity';
import { hazards } from './hazards.entity';
import { trapped_occupants } from './trapped_occupants.entity';
import { rescue_teams } from './rescue_teams.entity';

@Entity()
export class isolation_events {
  @PrimaryGeneratedColumn()
  id: number;

  // Event Details
  @Column({ length: 30 })
  event_type: string;

  @ManyToOne(() => nodes)
  @JoinColumn({ name: 'node_id' })
  node: nodes;

  @Column({ type: 'integer' })
  node_id: number;

  // References
  @ManyToOne(() => hazards, { nullable: true })
  @JoinColumn({ name: 'hazard_id' })
  hazard: hazards;

  @ManyToOne(() => trapped_occupants, { nullable: true })
  @JoinColumn({ name: 'trapped_occupant_id' })
  trapped_occupant: trapped_occupants;

  @ManyToOne(() => rescue_teams, { nullable: true })
  @JoinColumn({ name: 'rescue_team_id' })
  rescue_team: rescue_teams;

  // Event Data
  @Column({ type: 'jsonb', nullable: true })
  details: Record<string, any>;

  // Timestamp
  @Column({ type: 'timestamp', default: () => 'NOW()' })
  event_at: Date;
}

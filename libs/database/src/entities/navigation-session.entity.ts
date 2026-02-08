import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';
import { building } from './building.entity';
import { floor } from './floor.entity';
import { nodes } from './nodes.entity';

@Entity('navigation_sessions')
export class NavigationSession {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id' })
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'building_id' })
  buildingId: number;

  @ManyToOne(() => building)
  @JoinColumn({ name: 'building_id' })
  building: building;

  // Route Start
  @Column({ name: 'start_node_id', nullable: true })
  startNodeId: number;

  @ManyToOne(() => nodes, { nullable: true })
  @JoinColumn({ name: 'start_node_id' })
  startNode: nodes;

  @Column({
    name: 'start_x',
    type: 'decimal',
    precision: 10,
    scale: 4,
    nullable: true,
  })
  startX: number;

  @Column({
    name: 'start_y',
    type: 'decimal',
    precision: 10,
    scale: 4,
    nullable: true,
  })
  startY: number;

  @Column({ name: 'start_floor_id', nullable: true })
  startFloorId: number;

  @ManyToOne(() => floor, { nullable: true })
  @JoinColumn({ name: 'start_floor_id' })
  startFloor: floor;

  // Route Destination
  @Column({ name: 'destination_node_id', nullable: true })
  destinationNodeId: number;

  @ManyToOne(() => nodes, { nullable: true })
  @JoinColumn({ name: 'destination_node_id' })
  destinationNode: nodes;

  @Column({ name: 'destination_type', length: 30, default: 'nearest_exit' })
  destinationType: string; // 'nearest_exit', 'safe_point', 'specific_node'

  // Route Data
  @Column({
    name: 'current_route',
    type: 'geometry',
    spatialFeatureType: 'LineString',
    srid: 3857,
    nullable: true,
  })
  currentRoute: string;

  @Column({ name: 'route_geojson', type: 'jsonb', nullable: true })
  routeGeojson: object;

  @Column({ type: 'jsonb', nullable: true })
  instructions: object;

  // Progress
  @Column({
    name: 'total_distance',
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  totalDistance: number;

  @Column({
    name: 'remaining_distance',
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  remainingDistance: number;

  @Column({ name: 'eta_seconds', nullable: true })
  etaSeconds: number;

  @Column({ name: 'current_instruction_index', default: 0 })
  currentInstructionIndex: number;

  @Column({ name: 'progress_percent', default: 0 })
  progressPercent: number;

  // Stats
  @Column({ name: 'reroute_count', default: 0 })
  rerouteCount: number;

  @Column({ name: 'last_reroute_reason', length: 50, nullable: true })
  lastRerouteReason: string;

  // Status
  @Column({ length: 20, default: 'active' })
  status: string; // 'active', 'completed', 'aborted', 'trapped'

  // Timestamps
  @Column({
    name: 'started_at',
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
  })
  startedAt: Date;

  @Column({ name: 'last_position_at', type: 'timestamp', nullable: true })
  lastPositionAt: Date;

  @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
  completedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

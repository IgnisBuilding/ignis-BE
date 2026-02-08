import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { User } from './user.entity';
import { building } from './building.entity';
import { floor } from './floor.entity';
import { nodes } from './nodes.entity';

@Entity('user_positions')
export class UserPosition {
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

  @Column({ name: 'floor_id' })
  floorId: number;

  @ManyToOne(() => floor)
  @JoinColumn({ name: 'floor_id' })
  floor: floor;

  @Column({ name: 'nearest_node_id', nullable: true })
  nearestNodeId: number;

  @ManyToOne(() => nodes, { nullable: true })
  @JoinColumn({ name: 'nearest_node_id' })
  nearestNode: nodes;

  // Local building coordinates (meters)
  @Column({ type: 'decimal', precision: 10, scale: 4 })
  x: number;

  @Column({ type: 'decimal', precision: 10, scale: 4 })
  y: number;

  @Column({
    type: 'geometry',
    spatialFeatureType: 'Point',
    srid: 3857,
    nullable: true,
  })
  geometry: string;

  @Column({
    name: 'accuracy_meters',
    type: 'decimal',
    precision: 8,
    scale: 2,
    default: 5.0,
  })
  accuracyMeters: number;

  @Column({
    type: 'decimal',
    precision: 3,
    scale: 2,
    nullable: true,
    default: 0.5,
  })
  confidence: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  heading: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  speed: number;

  @Column({ name: 'sensor_data', type: 'jsonb', nullable: true })
  sensorData: object;

  @Column({ name: 'position_source', length: 20, default: 'wifi' })
  positionSource: string;

  @Column({ length: 20, default: 'active' })
  status: string; // 'active', 'navigating', 'safe', 'trapped', 'offline'

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  timestamp: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

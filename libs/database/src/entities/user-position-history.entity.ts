import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';
import { building } from './building.entity';
import { floor } from './floor.entity';
import { NavigationSession } from './navigation-session.entity';
import { nodes } from './nodes.entity';

@Entity('user_position_history')
export class UserPositionHistory {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id', nullable: true })
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: true })
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

  @Column({ name: 'session_id', nullable: true })
  sessionId: number;

  @ManyToOne(() => NavigationSession, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'session_id' })
  session: NavigationSession;

  @Column({ name: 'node_id', nullable: true })
  nodeId: number;

  @ManyToOne(() => nodes, { nullable: true })
  @JoinColumn({ name: 'node_id' })
  node: nodes;

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

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  heading: number;

  @Column({
    name: 'accuracy_meters',
    type: 'decimal',
    precision: 8,
    scale: 2,
    nullable: true,
  })
  accuracyMeters: number;


  @Column({ name: 'position_source', length: 20, nullable: true })
  positionSource: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  timestamp: Date;
}

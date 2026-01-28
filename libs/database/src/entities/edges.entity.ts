import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  JoinColumn,
  ManyToOne,
} from 'typeorm';
import { nodes } from './nodes.entity';

@Entity()
export class edges {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'source_id' })
  source_id: number;

  @ManyToOne(() => nodes)
  @JoinColumn({ name: 'source_id' })
  source: nodes;

  @Column({ name: 'target_id' })
  target_id: number;

  @ManyToOne(() => nodes)
  @JoinColumn({ name: 'target_id' })
  target: nodes;

  @Column({ name: 'edge_type', nullable: true })
  edge_type: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 1 })
  cost: number;

  @Column({ name: 'is_emergency_route', default: false })
  is_emergency_route: boolean;

  @Column({ name: 'width_meters', type: 'decimal', precision: 5, scale: 2, nullable: true })
  width_meters: number;

  @Column({ type: 'geometry', spatialFeatureType: 'LineString', srid: 3857 })
  geometry: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;

  @Column({
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  updated_at: Date;
}

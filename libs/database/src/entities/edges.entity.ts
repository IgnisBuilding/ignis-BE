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

  @ManyToOne(() => nodes)
  @JoinColumn({ name: 'source_id' })
  source: nodes;

  @ManyToOne(() => nodes)
  @JoinColumn({ name: 'target_id' })
  target: nodes;

  @Column()
  cost: number;

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

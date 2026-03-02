import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  JoinColumn,
  ManyToOne,
} from 'typeorm';
import { apartment } from './apartment.entity';
import { floor } from './floor.entity';

@Entity()
export class room {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @ManyToOne(() => apartment)
  @JoinColumn({ name: 'apartment_id' })
  apartment: apartment;

  @ManyToOne(() => floor)
  @JoinColumn({ name: 'floor_id' })
  floor: floor;

  @Column()
  type: string;

  @Column({ type: 'geometry', spatialFeatureType: 'Polygon', srid: 3857 })
  geometry: string;

  @Column({ nullable: true })
  capacity: number;

  @Column({ name: 'area_sqm', type: 'numeric', precision: 10, scale: 2, nullable: true })
  areaSqm: number;

  @Column({ nullable: true })
  color: string;

  @Column({ type: 'geometry', spatialFeatureType: 'Point', srid: 3857, nullable: true })
  centroid: string;

  @Column({ name: 'external_id', nullable: true })
  externalId: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;

  @Column({
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  updated_at: Date;
}

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

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;

  @Column({
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  updated_at: Date;
}

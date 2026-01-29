import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  JoinColumn,
  ManyToOne,
} from 'typeorm';
import { floor } from './floor.entity';
import { apartment } from './apartment.entity';
import { room } from './room.entity';

@Entity()
export class nodes {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'floor_id' })
  floor_id: number;

  @ManyToOne(() => floor)
  @JoinColumn({ name: 'floor_id' })
  floor: floor;

  @Column({ name: 'room_id', nullable: true })
  room_id: number;

  @ManyToOne(() => room, { nullable: true })
  @JoinColumn({ name: 'room_id' })
  room: room;

  @ManyToOne(() => apartment, { nullable: true })
  @JoinColumn({ name: 'apartment_id' })
  apartment: apartment;

  @Column()
  type: string;

  @Column({ name: 'node_category', nullable: true })
  node_category: string;

  @Column({ name: 'is_accessible', default: true })
  is_accessible: boolean;

  @Column({ nullable: true })
  description: string;

  @Column({ type: 'geometry', spatialFeatureType: 'Point', srid: 3857 })
  geometry: string;

  @Column({ name: 'external_id', nullable: true })
  external_id: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;

  @Column({
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  updated_at: Date;
}

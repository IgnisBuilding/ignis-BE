import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { building } from './building.entity';
import { floor } from './floor.entity';
import { room } from './room.entity';
import { nodes } from './nodes.entity';

@Entity()
export class camera {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 100 })
  name: string;

  @Column({ length: 500 })
  rtsp_url: string;

  @Column({ length: 50, unique: true })
  camera_id: string; // Matches fire-detect camera_id

  @Column()
  building_id: number;

  @ManyToOne(() => building)
  @JoinColumn({ name: 'building_id' })
  building: building;

  @Column({ nullable: true })
  floor_id: number;

  @ManyToOne(() => floor)
  @JoinColumn({ name: 'floor_id' })
  floor: floor;

  @Column({ nullable: true })
  room_id: number;

  @ManyToOne(() => room)
  @JoinColumn({ name: 'room_id' })
  room: room;

  @Column({ length: 20, default: 'active' })
  status: string; // active, inactive, maintenance

  @Column({ length: 255, nullable: true })
  location_description: string;

  @Column({
    type: 'geometry',
    spatialFeatureType: 'Point',
    srid: 3857,
    nullable: true,
  })
  geometry: string; // Camera location on map

  @Column({ name: 'node_id', nullable: true })
  nodeId: number;

  @ManyToOne(() => nodes, { nullable: true })
  @JoinColumn({ name: 'node_id' })
  node: nodes;

  @Column({ default: true })
  is_fire_detection_enabled: boolean;

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

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  JoinColumn,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { nodes } from './nodes.entity';
import { floor } from './floor.entity';
import { OpeningRoom } from './opening_room.entity';

@Entity('opening')
export class Opening {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'floor_id', nullable: true })
  floorId: number;

  @ManyToOne(() => floor, { nullable: true })
  @JoinColumn({ name: 'floor_id' })
  floor: floor;

  @Column({ name: 'node_id', nullable: true })
  nodeId: number;

  @ManyToOne(() => nodes, { nullable: true })
  @JoinColumn({ name: 'node_id' })
  node: nodes;

  @Column({ name: 'opening_type' })
  openingType: string;

  @Column({ nullable: true })
  name: string;

  @Column({ name: 'width_meters', type: 'numeric', precision: 5, scale: 2, nullable: true })
  widthMeters: number;

  @Column({ nullable: true })
  color: string;

  @Column({ nullable: true })
  capacity: number;

  @Column({ name: 'is_emergency_exit', default: false })
  isEmergencyExit: boolean;

  @Column({ type: 'geometry', spatialFeatureType: 'LineString', srid: 3857 })
  geometry: string;

  @OneToMany(() => OpeningRoom, (openingRoom) => openingRoom.opening)
  openingRooms: OpeningRoom[];

  @Column({ name: 'external_id', nullable: true })
  externalId: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

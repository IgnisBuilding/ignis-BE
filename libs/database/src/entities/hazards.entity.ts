import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  JoinColumn,
  ManyToOne,
} from 'typeorm';
import { nodes } from './nodes.entity';
import { apartment } from './apartment.entity';
import { room } from './room.entity';
import { floor } from './floor.entity';

@Entity()
export class hazards {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  type: string;

  @ManyToOne(() => apartment, { nullable: true })
  @JoinColumn({ name: 'apartment_id' })
  apartment: apartment;

  @Column({ name: 'apartment_id', nullable: true })
  apartmentId: number;

  @ManyToOne(() => room, { nullable: true })
  @JoinColumn({ name: 'room_id' })
  room: room;

  @Column({ name: 'room_id', nullable: true })
  roomId: number;

  @ManyToOne(() => floor, { nullable: true })
  @JoinColumn({ name: 'floor_id' })
  floor: floor;

  @Column({ name: 'floor_id', nullable: true })
  floorId: number;

  @ManyToOne(() => nodes, { nullable: true })
  @JoinColumn({ name: 'node_id' })
  node: nodes;

  @Column({ name: 'node_id', nullable: true })
  nodeId: number;

  @Column()
  severity: string;

  @Column()
  status: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;

  @Column({
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  updated_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  responded_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  resolved_at: Date;
}

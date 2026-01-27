import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { nodes } from './nodes.entity';
import { floor } from './floor.entity';

@Entity('safe_points')
export class SafePoint {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'node_id', unique: true })
  nodeId: number;

  @ManyToOne(() => nodes, { nullable: false })
  @JoinColumn({ name: 'node_id' })
  node: nodes;

  @Column({ name: 'floor_id', nullable: true })
  floorId: number;

  @ManyToOne(() => floor, { nullable: true })
  @JoinColumn({ name: 'floor_id' })
  floor: floor;

  @Column({ default: 1 })
  priority: number;

  @Column({ name: 'has_window', default: false })
  hasWindow: boolean;

  @Column({ name: 'has_external_access', default: false })
  hasExternalAccess: boolean;

  @Column({ name: 'is_fire_resistant', default: false })
  isFireResistant: boolean;

  @Column({ name: 'has_communication', default: true })
  hasCommunication: boolean;

  @Column({ default: 4 })
  capacity: number;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

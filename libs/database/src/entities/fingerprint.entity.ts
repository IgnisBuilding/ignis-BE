import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { building } from './building.entity';
import { floor } from './floor.entity';
import { nodes } from './nodes.entity';

@Entity('fingerprints')
export class Fingerprint {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'building_id' })
  buildingId: number;

  @ManyToOne(() => building, { nullable: false })
  @JoinColumn({ name: 'building_id' })
  building: building;

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

  @Column({ type: 'float' })
  x: number;

  @Column({ type: 'float' })
  y: number;

  @Column({ nullable: true })
  label: string;

  @Column({ type: 'jsonb' })
  signals: Array<{ bssid: string; ssid: string; rssi: number; frequency?: number }>;

  @Column({ name: 'collected_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  collectedAt: Date;

  @Column({ name: 'created_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({
    name: 'updated_at',
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  updatedAt: Date;
}

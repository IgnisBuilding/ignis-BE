import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  JoinColumn,
  ManyToOne,
} from 'typeorm';
import { nodes } from './nodes.entity';
import { apartment } from './apartment.entity';

@Entity()
export class hazards {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  type: string;

  @ManyToOne(() => apartment)
  @JoinColumn({ name: 'apartment_id' })
  apartment: apartment;

  @ManyToOne(() => nodes)
  @JoinColumn({ name: 'node_id' })
  node: nodes;

  @Column()
  severity: string;

  @Column()
  status: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;

  @Column({
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  updated_at: Date;
}

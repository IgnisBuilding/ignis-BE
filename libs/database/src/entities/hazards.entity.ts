import { Entity, PrimaryGeneratedColumn, Column, JoinColumn, ManyToOne } from 'typeorm';
import { nodes } from './nodes.entity';

@Entity()
export class hazards {
    @PrimaryGeneratedColumn()
    id: number;
    
    @Column()
    type: string;

    @Column()
    apartment_id: number;

    @ManyToOne(() => nodes)
    @JoinColumn({ name: 'node_id' })
    node_id: nodes;

    @Column()
    severity: string;

    @Column()
    status: string;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    created_at: Date;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
    updated_at: Date;
}  
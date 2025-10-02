import { Entity, PrimaryGeneratedColumn, Column, JoinColumn, ManyToOne } from 'typeorm';
import { nodes } from './nodes.entity';

@Entity()
export class evacuation_route {
    @PrimaryGeneratedColumn()
    id: number;
    
    @ManyToOne(()=> nodes)
    @JoinColumn({ name: 'start_node' })
    start_node: nodes;

    @ManyToOne(()=> nodes)
    @JoinColumn({ name: 'start_node' })
    end_node: nodes;

    @Column({ type: 'geometry', spatialFeatureType: 'LineString', srid: 3857})
    path: string;

    @Column()
    assigned_to: number;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    created_at: Date;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
    updated_at: Date;
}  
import { Entity, PrimaryGeneratedColumn, Column, JoinColumn, ManyToOne } from 'typeorm';
import { Node } from './nodes.entity';

@Entity()
export class Edge {
    @PrimaryGeneratedColumn()
    id: number;
    
    @ManyToOne(()=>Node)
    @JoinColumn({ name: 'source_id' })
    source: Node;

    @ManyToOne(()=>Node)
    @JoinColumn({ name: 'target_id' })
    target: Node;

    @Column()
    cost: number;

    @Column({ type: 'geometry', spatialFeatureType: 'LineString', srid: 3857})
    geometry: string;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    created_at: Date;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
    updated_at: Date;
}  
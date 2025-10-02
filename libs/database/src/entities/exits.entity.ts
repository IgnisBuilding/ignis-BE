import { Entity, PrimaryGeneratedColumn, Column, JoinColumn, ManyToOne } from 'typeorm';
import { nodes } from './nodes.entity';
@Entity()
export class exits {
    @PrimaryGeneratedColumn()
    id: number;
    
    @ManyToOne(()=>nodes)
    @JoinColumn({ name: 'node_id' })
    node_id: nodes;

    @Column()
    floor_id: number;

    @Column()
    type: string;

    @Column()
    capacity: number;

    @Column({ type: 'geometry', spatialFeatureType: 'LineString', srid: 3857})
    geometry: string;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    created_at: Date;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
    updated_at: Date;
}  
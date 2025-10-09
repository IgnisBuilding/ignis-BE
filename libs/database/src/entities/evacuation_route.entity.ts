import { Entity, PrimaryGeneratedColumn, Column, JoinColumn, ManyToOne } from 'typeorm';
import { nodes } from './nodes.entity';

@Entity('evacuation_route')
export class EvacuationRoute {
    @PrimaryGeneratedColumn()
    id: number;
    
    @ManyToOne(()=> nodes, { eager: false })
    @JoinColumn({ name: 'start_node_id' })
    startNode: nodes;

    @ManyToOne(()=> nodes, { eager: false })
    @JoinColumn({ name: 'end_node_id' })
    endNode: nodes;

    @Column({ type: 'geometry', spatialFeatureType: 'LineString', srid: 3857})
    path: string;

    @Column({ name: 'assigned_to', nullable: true })
    assignedTo: number;

    @Column()
    distance: number;

    @Column({ name: 'created_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    createdAt: Date;

    @Column({ name: 'updated_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
    updatedAt: Date;
}  
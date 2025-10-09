import { Entity, PrimaryGeneratedColumn, Column, JoinColumn, ManyToOne } from 'typeorm';
import { Node } from './nodes.entity';

@Entity('evacuation_route')
export class EvacuationRoute {
    @PrimaryGeneratedColumn()
    id: number;
    
    @ManyToOne(()=> Node, { eager: false })
    @JoinColumn({ name: 'start_node_id' })
    startNode: Node;

    @ManyToOne(()=> Node, { eager: false })
    @JoinColumn({ name: 'end_node_id' })
    endNode: Node;

    @Column({ type: 'geometry', spatialFeatureType: 'LineString', srid: 3857})
    path: string;

    @Column({ name: 'assigned_to', nullable: true })
    assignedTo: number;

    @Column({ name: 'created_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    createdAt: Date;

    @Column({ name: 'updated_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
    updatedAt: Date;
}  
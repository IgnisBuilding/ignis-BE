import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { building } from './building.entity';

@Entity()
export class floor {
    @PrimaryGeneratedColumn()
    id: number;
    
    @Column()
    name: string;

    @Column('integer')
    level: number;

    @Column()
    building_id: number;

    @ManyToOne(() => building)
    @JoinColumn({ name: 'building_id' })
    building: building;

    @Column({ type: 'geometry', spatialFeatureType: 'Polygon', srid: 3857})
    geometry: string;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    created_at: Date;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
    updated_at: Date;
}  
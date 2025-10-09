import { Entity, PrimaryGeneratedColumn, Column, JoinColumn, ManyToOne } from 'typeorm';
import { floor } from './floor.entity';
import { apartment } from './apartment.entity';
@Entity()
export class Node {
    @PrimaryGeneratedColumn()
    id: number;

    @ManyToOne(()=>floor)
    @JoinColumn({ name: 'floor_id' })
    floor: floor;

    @ManyToOne(()=>apartment)
    @JoinColumn({ name: 'apartment_id' })
    apartment: apartment;

    @Column()
    type: string;

    @Column({ type: 'geometry', spatialFeatureType: 'Point', srid: 3857})
    geometry: string;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    created_at: Date;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
    updated_at: Date;
}  
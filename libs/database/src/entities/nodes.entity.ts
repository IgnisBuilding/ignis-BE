import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class nodes {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    floor_id: number;

    @Column()
    room_id: number;

    @Column()
    type: string;

    @Column({ type: 'geometry', spatialFeatureType: 'Point', srid: 3857})
    geometry: string;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    created_at: Date;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
    updated_at: Date;
}  
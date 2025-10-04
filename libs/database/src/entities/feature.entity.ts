import { Entity, PrimaryGeneratedColumn, Column, JoinColumn, ManyToOne } from 'typeorm';
import { room } from './room.entity';
import { floor } from './floor.entity';

@Entity()
export class features {
    @PrimaryGeneratedColumn()
    id: number;
    
    @Column()
    name: string;

    @Column()
    type: string

    @ManyToOne(()=>room)
    @JoinColumn({ name: 'room_id' })
    room: room;

    @ManyToOne(()=>floor)
    @JoinColumn({ name: 'floor_id' })
    floor: floor;

    @Column({ type: 'geometry', spatialFeatureType: 'Polygon', srid: 3857})
    geometry: string;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    created_at: Date;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
    updated_at: Date;
}  
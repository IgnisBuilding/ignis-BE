import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class sensor {
    @PrimaryGeneratedColumn()
    id: number;
    
    @Column()
    type: number;

    @Column()
    building_id: number;

    @Column({ type: 'date'})
    floor_id: number;

    @Column({ type: 'date'})
    appartment_id: number;

    @Column({ type: 'date'})
    location_description: string;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    created_at: Date;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
    updated_at: Date;
}  
import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class ammenity {
    @PrimaryGeneratedColumn()
    id: number;
    
    @Column()
    building_id: number;

    @Column()
    name: number;

    @Column({ type: 'date'})
    description: number;

    @Column({ type: 'date'})
    available: number;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    created_at: Date;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
    updated_at: Date;
}  
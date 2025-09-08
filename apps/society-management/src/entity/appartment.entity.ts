import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class floor {
    @PrimaryGeneratedColumn()
    id: number;
    
    @Column()
    unit_number: string;

    @Column()
    floor_id: number;

    @Column()
    occupied: boolean;

    @Column()
    owner_id: number;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    created_at: Date;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
    updated_at: Date;
}  
import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class ammenity {
    @PrimaryGeneratedColumn()
    id: number;
    
    @Column()
    ammenity_id: number;

    @Column()
    user_id: number;

    @Column({ type: 'date'})
    start_time: number;

    @Column({ type: 'date'})
    end_time: number;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    created_at: Date;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
    updated_at: Date;
}  
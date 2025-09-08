import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class sensor_log {
    @PrimaryGeneratedColumn()
    id: number;
    
    @Column()
    sensor_id: number;

    @Column()
    sensor_detection: number;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    created_at: Date;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
    updated_at: Date;
}  
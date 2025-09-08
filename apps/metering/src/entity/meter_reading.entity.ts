import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class meter_reading {
    @PrimaryGeneratedColumn()
    id: number;
    
    @Column()
    meter_id: number;

    @Column({type: 'float'})
    value: number;

   @Column({ type: 'date' })
    time: string;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    created_at: Date;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
    updated_at: Date;
}  
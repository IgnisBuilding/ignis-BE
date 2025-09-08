import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class bill {
    @PrimaryGeneratedColumn()
    id: number;
    
    @Column()
    owner_id: number;

    @Column()
    type: string;

    @Column({ type: 'decimal', precision: 12, scale: 2 })
    amount: number;

    @Column({ type: 'decimal', precision: 12, scale: 2 })
    usage: number;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    created_at: Date;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
    updated_at: Date;
}  
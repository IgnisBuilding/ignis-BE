import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class payment {
    @PrimaryGeneratedColumn()
    id: number;
    
    @Column()
    bill_id: number;

    @Column()
    user_id: number;

    @Column({ type: 'date'})
    split_amount: number;

    @Column({ type: 'boolean', default: false })
    paid: boolean;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    created_at: Date;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
    updated_at: Date;
}  